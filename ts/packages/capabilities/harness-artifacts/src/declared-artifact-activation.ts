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
	nodeHarnessArtifactFileSystemGateway,
	type HarnessArtifactProvisionErrorInfo,
	type PreparedHarnessArtifactProvision,
} from "./provision-apply.ts";
import { INSTALL_MANIFEST_FILE_NAME, readInstallManifestAtRoot } from "./provision-manifest.ts";
import type {
	HarnessArtifactRemovalReason,
	PreparedHarnessArtifactRemoval,
} from "./provision-removal.ts";
import {
	appliedHarnessArtifactTransitionFileEffects,
	applyProjectHarnessArtifactTransitions,
	prepareProjectHarnessArtifactTransitions,
	type AppliedHarnessArtifactTransition,
	type HarnessArtifactProvisionReconciliationErrorInfo,
	type PreparedProjectHarnessArtifactTransitions,
} from "./project-harness-artifact-transitions.ts";
import type {
	DesiredHarnessArtifact,
	HarnessManifestSnapshot,
	SkippedArtifactCollision,
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

type PreparedDeclaredArtifactActivationItem =
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
	readonly reconciliation: PreparedProjectHarnessArtifactTransitions;
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
	readonly removalReason?: HarnessArtifactRemovalReason;
}

export type ApplyPreparedDeclaredArtifactActivationResult =
	| { readonly ok: true; readonly completed: readonly DeclaredArtifactActivationOutcome[] }
	| {
			readonly ok: false;
			readonly error: HarnessArtifactProvisionReconciliationErrorInfo;
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
	const projectTransitions = await prepareProjectHarnessArtifactTransitions({
		desired,
		selectedHarnesses,
		manifests: manifests.value,
		pathContext: context,
		trustedRepoRoot: request.projectRoot,
		deletionAuthority: {
			type: "full",
			preserveRemovedSources: discovery.diagnostics.length > 0,
		},
		conflictPolicy: { type: "strict", shouldForce: false },
		fs,
	});
	if (!projectTransitions.ok) return projectTransitions;
	const artifacts: PreparedDeclaredArtifactActivationItem[] = projectTransitions.value.items.map(
		(item) =>
			item.type === "remove"
				? {
						type: "remove",
						key: item.key,
						harness: item.removal.entry.harness,
						action: item.conflictingFiles.length > 0 ? "conflicted" : "removed",
						removal: item.removal,
					}
				: {
						type: "provision",
						key: item.key,
						artifact: item.pair.desired.artifact,
						harness: item.pair.harness,
						action: item.action,
						provision: item.provision,
					},
	);
	return resultOk({
		modules: [...request.modules].sort((left, right) =>
			left.moduleRoot.localeCompare(right.moduleRoot),
		),
		selectedHarnesses,
		diagnostics: discovery.diagnostics,
		skippedCollisions: projectTransitions.value.skippedCollisions,
		artifacts,
		reconciliation: projectTransitions.value,
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
	const applied = await applyProjectHarnessArtifactTransitions(prepared.reconciliation);
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

function completedActivationOutcomes(
	items: readonly PreparedDeclaredArtifactActivationItem[],
	transitions: ReadonlyMap<string, AppliedHarnessArtifactTransition>,
): readonly DeclaredArtifactActivationOutcome[] {
	return items.flatMap((item) => {
		if (item.action === "unchanged") return [outcomeForItem(item, [], [], [])];
		const transition = transitions.get(item.key);
		if (transition === undefined) return [];
		const effects = appliedHarnessArtifactTransitionFileEffects(transition);
		return [
			outcomeForItem(item, effects.conflictingFiles, effects.writtenFiles, effects.removedFiles),
		];
	});
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
