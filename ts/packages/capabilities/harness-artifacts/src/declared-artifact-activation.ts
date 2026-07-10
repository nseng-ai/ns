import { join } from "node:path";

import { resultOk, type Result } from "@nseng-ai/foundation/result";

import type { SkillHarnessArtifactEntry } from "./artifact-catalog.ts";
import type {
	HarnessArtifactFileSystemGateway,
	HarnessArtifactModuleDiscoveryGateway,
} from "./filesystem.ts";
import {
	ALL_HARNESS_IDS,
	resolveHarnessSkillRoot,
	type HarnessId,
	type HarnessPathContext,
} from "./harness-paths.ts";
import {
	discoverDeclaredExtensionModuleHarnessArtifacts,
	type DeclaredExtensionModuleArtifactFacts,
	type ModuleArtifactDiscoveryDiagnostic,
} from "./module-artifact-discovery.ts";
import {
	applyPreparedProvisionReconciliation,
	classifyProvisionAction,
	conflictingFilesFromDecisions,
	INSTALL_MANIFEST_FILE_NAME,
	nodeHarnessArtifactFileSystemGateway,
	prepareHarnessArtifactRemoval,
	prepareProvision,
	readInstallManifestAtRoot,
	type AppliedHarnessArtifactTransition,
	type HarnessArtifactProvisionErrorInfo,
	type PreparedHarnessArtifactRemoval,
	type PreparedHarnessArtifactTransition,
	type PreparedHarnessArtifactProvision,
} from "./provision-apply.ts";
import { installManifestKey, provisionIdentityKey } from "./provision-plan.ts";
import {
	planHarnessArtifactReconcile,
	type DesiredHarnessArtifact,
	type HarnessManifestSnapshot,
	type PlannedHarnessArtifactRemoval,
	type ReconcilePair,
	type SkippedArtifactCollision,
} from "./reconcile.ts";

export const DECLARED_ARTIFACT_ACTIVATION_ACTIONS = [
	"installed",
	"refreshed",
	"unchanged",
	"conflicted",
	"removed",
] as const;

export type DeclaredArtifactActivationAction =
	(typeof DECLARED_ARTIFACT_ACTIVATION_ACTIONS)[number];

export type PreparedDeclaredArtifactActivationItem =
	| {
			readonly type: "provision";
			readonly key: string;
			readonly artifact: SkillHarnessArtifactEntry;
			readonly harness: HarnessId;
			readonly action: DeclaredArtifactActivationAction;
			readonly provision: PreparedHarnessArtifactProvision;
	  }
	| {
			readonly type: "remove";
			readonly key: string;
			readonly artifact: SkillHarnessArtifactEntry;
			readonly harness: HarnessId;
			readonly action: DeclaredArtifactActivationAction;
			readonly removal: PreparedHarnessArtifactRemoval;
	  };

export interface PreparedDeclaredArtifactActivation {
	readonly modules: readonly DeclaredExtensionModuleArtifactFacts[];
	readonly selectedHarnesses: readonly HarnessId[];
	readonly diagnostics: readonly ModuleArtifactDiscoveryDiagnostic[];
	readonly skippedCollisions: readonly SkippedArtifactCollision[];
	readonly artifacts: readonly PreparedDeclaredArtifactActivationItem[];
	readonly reconciliation?: {
		readonly transitions: readonly PreparedHarnessArtifactTransition[];
		readonly shouldForce: false;
	};
}

export interface PrepareDeclaredArtifactActivationRequest {
	readonly projectRoot: string;
	readonly modules: readonly DeclaredExtensionModuleArtifactFacts[];
	readonly selectedHarnesses: readonly HarnessId[];
	readonly fs?: HarnessArtifactFileSystemGateway;
	readonly discoveryGateway?: HarnessArtifactModuleDiscoveryGateway;
}

export interface DeclaredArtifactActivationOutcome {
	readonly key: string;
	readonly action: DeclaredArtifactActivationAction;
	readonly artifactId: string;
	readonly skillName: string;
	readonly harness: HarnessId;
	readonly targetArtifactPath: string;
	readonly manifestPath: string;
	readonly writtenFiles: readonly string[];
	readonly conflictingFiles: readonly string[];
	readonly removedFiles?: readonly string[];
	readonly removalReason?:
		| "removed-source"
		| "deselected-harness"
		| "same-target-replacement"
		| "obsolete-file";
}

export type ApplyPreparedDeclaredArtifactActivationResult =
	| { readonly ok: true; readonly completed: readonly DeclaredArtifactActivationOutcome[] }
	| {
			readonly ok: false;
			readonly error: HarnessArtifactProvisionErrorInfo;
			readonly completed: readonly DeclaredArtifactActivationOutcome[];
	  };

/** Prepare a full project desired-state reconciliation for supplied declared descriptors. */
export async function prepareDeclaredArtifactActivation(
	request: PrepareDeclaredArtifactActivationRequest,
): Promise<Result<PreparedDeclaredArtifactActivation, HarnessArtifactProvisionErrorInfo>> {
	const fs = request.fs ?? nodeHarnessArtifactFileSystemGateway;
	const discovery = await discoverDeclaredExtensionModuleHarnessArtifacts({
		modules: request.modules,
		gateway: request.discoveryGateway ?? nodeHarnessArtifactFileSystemGateway,
	});
	const desired = discovery.catalogs.flatMap((catalog) =>
		catalog.artifacts.map(
			(artifact): DesiredHarnessArtifact => ({
				artifact,
				sourceRoot: catalog.moduleRoot,
				sourceVersion: catalog.version,
			}),
		),
	);
	const selectedHarnesses = [...new Set(request.selectedHarnesses)].sort((left, right) =>
		left.localeCompare(right),
	);
	const context: HarnessPathContext = { projectRoot: request.projectRoot };
	const manifests = await readAllProjectManifests({ context, fs });
	if (!manifests.ok) return manifests;
	const reconcilePlan = planHarnessArtifactReconcile({
		desired,
		harnessSelection: selectedHarnesses,
		manifests: manifests.value,
		deletionAuthority: {
			type: "full",
			preserveRemovedSources: discovery.diagnostics.length > 0,
		},
	});
	const artifacts: PreparedDeclaredArtifactActivationItem[] = [];
	const transitions: PreparedHarnessArtifactTransition[] = [];
	for (const planned of reconcilePlan.removals) {
		const removal = await prepareRemoval(planned, fs, request.projectRoot);
		if (!removal.ok) return removal;
		artifacts.push({
			type: "remove",
			key: planned.key,
			artifact: artifactFromRemoval(removal.value),
			harness: removal.value.entry.harness,
			action: removal.value.conflictingFiles.length > 0 ? "conflicted" : "removed",
			removal: removal.value,
		});
		if (removal.value.conflictingFiles.length === 0) {
			transitions.push({ type: "remove", removal: removal.value });
		}
	}
	const replacementTargetPaths = new Set(
		reconcilePlan.removals
			.filter((removal) => removal.reason === "same-target-replacement")
			.flatMap((removal) => Object.values(removal.entry.files).map((file) => file.targetPath)),
	);
	for (const pair of reconcilePlan.pairs) {
		const item = await prepareProvisionItem({ pair, context, fs, replacementTargetPaths });
		if (!item.ok) return item;
		artifacts.push(item.value);
		if (item.value.action !== "unchanged" && item.value.action !== "conflicted") {
			transitions.push({ type: "provision", provision: item.value.provision });
		}
	}
	return resultOk({
		modules: [...request.modules].sort((left, right) =>
			left.moduleRoot.localeCompare(right.moduleRoot),
		),
		selectedHarnesses,
		diagnostics: discovery.diagnostics,
		skippedCollisions: reconcilePlan.skippedCollisions,
		artifacts,
		reconciliation: { transitions, shouldForce: false },
	});
}

/** Apply the aggregate prepared desired-state transition. */
export async function applyPreparedDeclaredArtifactActivation(
	prepared: PreparedDeclaredArtifactActivation,
): Promise<ApplyPreparedDeclaredArtifactActivationResult> {
	const conflicts = prepared.artifacts.filter((item) => item.action === "conflicted");
	if (conflicts.length > 0) {
		return { ok: true, completed: conflicts.map((item) => outcomeForItem(item, [], [], [])) };
	}
	const applied = await applyPreparedProvisionReconciliation(
		prepared.reconciliation ?? {
			transitions: prepared.artifacts.flatMap(transitionsForItem),
			shouldForce: false,
		},
	);
	if (!applied.ok) {
		return {
			ok: false,
			error: applied.error,
			completed: completedActivationOutcomes(
				prepared.artifacts,
				applied.error.completedTransitions,
			),
		};
	}
	return {
		ok: true,
		completed: completedActivationOutcomes(prepared.artifacts, applied.value.outcomes),
	};
}

async function readAllProjectManifests(input: {
	context: HarnessPathContext;
	fs: HarnessArtifactFileSystemGateway;
}): Promise<Result<readonly HarnessManifestSnapshot[], HarnessArtifactProvisionErrorInfo>> {
	const snapshots: HarnessManifestSnapshot[] = [];
	for (const harness of ALL_HARNESS_IDS) {
		const root = resolveHarnessSkillRoot({ harness, scope: "project", context: input.context });
		if (!root.ok) throw new Error(root.error.message);
		const manifest = await readInstallManifestAtRoot({
			targetRoot: root.value.rootPath,
			fs: input.fs,
		});
		if (!manifest.ok) return manifest;
		snapshots.push({
			harness,
			targetRoot: root.value.rootPath,
			manifestPath: join(root.value.rootPath, INSTALL_MANIFEST_FILE_NAME),
			manifest: manifest.value,
		});
	}
	return resultOk(snapshots);
}

function prepareRemoval(
	planned: PlannedHarnessArtifactRemoval,
	fs: HarnessArtifactFileSystemGateway,
	trustedBoundaryRoot: string,
): ReturnType<typeof prepareHarnessArtifactRemoval> {
	return prepareHarnessArtifactRemoval({
		key: planned.key,
		reason: planned.reason,
		entry: planned.entry,
		expectedHarness: planned.snapshot.harness,
		expectedTargetRoot: planned.snapshot.targetRoot,
		trustedBoundaryRoot,
		manifestPath: planned.snapshot.manifestPath,
		fs,
	});
}

async function prepareProvisionItem(input: {
	pair: ReconcilePair;
	context: HarnessPathContext;
	fs: HarnessArtifactFileSystemGateway;
	replacementTargetPaths: ReadonlySet<string>;
}): Promise<
	Result<
		Extract<PreparedDeclaredArtifactActivationItem, { type: "provision" }>,
		HarnessArtifactProvisionErrorInfo
	>
> {
	const provision = await prepareProvision({
		artifact: input.pair.desired.artifact,
		harness: input.pair.harness,
		scope: "project",
		context: input.context,
		sourceRoot: input.pair.desired.sourceRoot,
		sourceVersion: input.pair.desired.sourceVersion,
		fs: input.fs,
	});
	if (!provision.ok) return provision;
	const preparedProvision: PreparedHarnessArtifactProvision = {
		...provision.value,
		decisions: {
			...provision.value.decisions,
			files: provision.value.decisions.files.map((decision) =>
				decision.type === "locally-edited-conflict" &&
				input.replacementTargetPaths.has(decision.file.targetPath)
					? { type: "fresh-write" as const, file: decision.file }
					: decision,
			),
		},
	};
	const conflictingFiles = [
		...conflictingFilesFromDecisions(preparedProvision.decisions),
		...provision.value.obsoleteFiles.flatMap((file) => {
			const fact = provision.value.obsoleteTargetFacts.find(
				(item) => item.targetPath === file.targetPath,
			);
			return fact?.type === "file" && fact.contentHash !== file.contentHash
				? [file.targetPath]
				: [];
		}),
	];
	return resultOk({
		type: "provision",
		key: provisionIdentityKey(provision.value.plan),
		artifact: input.pair.desired.artifact,
		harness: input.pair.harness,
		action: classifyProvisionAction({
			conflictingFiles,
			decisionsAreUnchanged:
				preparedProvision.decisions.files.every((decision) => decision.type === "unchanged") &&
				preparedProvision.obsoleteFiles.length === 0,
			hasManifestEntry:
				provision.value.manifest.artifacts[installManifestKey(provision.value.plan)] !== undefined,
		}),
		provision: preparedProvision,
	});
}

function transitionsForItem(
	item: PreparedDeclaredArtifactActivationItem,
): readonly PreparedHarnessArtifactTransition[] {
	if (item.action === "unchanged" || item.action === "conflicted") return [];
	return item.type === "remove"
		? [{ type: "remove", removal: item.removal }]
		: [{ type: "provision", provision: item.provision }];
}

function artifactFromRemoval(removal: PreparedHarnessArtifactRemoval): SkillHarnessArtifactEntry {
	return {
		id: removal.entry.artifactId,
		kind: "skill",
		name: removal.entry.provisionName,
		description: `Manifest-tracked ${removal.entry.provisionName} skill.`,
		skillName: removal.entry.provisionName,
		source: {
			type: removal.entry.source.type,
			packageName: removal.entry.source.packageName,
			relativePath: removal.entry.source.relativePath,
		},
	};
}

function completedActivationOutcomes(
	items: readonly PreparedDeclaredArtifactActivationItem[],
	transitions: readonly AppliedHarnessArtifactTransition[],
): readonly DeclaredArtifactActivationOutcome[] {
	const completed: DeclaredArtifactActivationOutcome[] = [];
	let transitionIndex = 0;
	for (const item of items) {
		if (item.action === "unchanged") {
			completed.push(outcomeForItem(item, [], [], []));
			continue;
		}
		const transition = transitions[transitionIndex];
		if (transition === undefined) break;
		transitionIndex += 1;
		if (transition.type === "remove") {
			completed.push(outcomeForItem(item, [], [], transition.removedFiles));
			continue;
		}
		if (transition.outcome.outcome === "conflicted") {
			completed.push(outcomeForItem(item, transition.outcome.conflictingFiles, [], []));
			continue;
		}
		completed.push(
			outcomeForItem(item, [], transition.outcome.writtenFiles, transition.outcome.removedFiles),
		);
	}
	return completed;
}

function outcomeForItem(
	item: PreparedDeclaredArtifactActivationItem,
	conflictingFiles: readonly string[],
	writtenFiles: readonly string[],
	removedFiles: readonly string[],
): DeclaredArtifactActivationOutcome {
	if (item.type === "remove") {
		return {
			key: item.key,
			action: item.action,
			artifactId: item.removal.entry.artifactId,
			skillName: item.removal.entry.provisionName,
			harness: item.removal.entry.harness,
			targetArtifactPath: item.removal.entry.targetArtifactPath,
			manifestPath: item.removal.manifestPath,
			writtenFiles: [],
			conflictingFiles: item.removal.conflictingFiles,
			removedFiles: [...removedFiles],
			removalReason: item.removal.reason,
		};
	}
	return {
		key: item.key,
		action: item.action,
		artifactId: item.artifact.id,
		skillName: item.artifact.skillName,
		harness: item.harness,
		targetArtifactPath: item.provision.plan.targetArtifactPath,
		manifestPath: item.provision.manifestPath,
		writtenFiles: [...writtenFiles],
		conflictingFiles: [...conflictingFiles],
		...(removedFiles.length === 0
			? {}
			: { removedFiles: [...removedFiles], removalReason: "obsolete-file" as const }),
	};
}
