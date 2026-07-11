import { resultOk, type Result } from "@nseng-ai/foundation/result";

import type { SkillHarnessArtifactEntry } from "./artifact-catalog.ts";
import type {
	HarnessArtifactFileSystemGateway,
	HarnessArtifactModuleDiscoveryGateway,
} from "./filesystem.ts";
import type { HarnessId, HarnessPathContext, HarnessPathErrorInfo } from "./harness-paths.ts";
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
import type {
	HarnessArtifactRemovalReason,
	PreparedHarnessArtifactRemoval,
} from "./provision-removal.ts";
import {
	appliedHarnessArtifactTransitionFileEffects,
	applyProjectHarnessArtifactTransitions,
	DECLARED_ARTIFACT_ACTIVATION_ACTIONS,
	prepareProjectHarnessArtifactTransitions,
	readProjectHarnessManifestSnapshots,
	type AppliedHarnessArtifactTransition,
	type DeclaredArtifactActivationAction,
	type HarnessArtifactProvisionReconciliationErrorInfo,
	type PreparedProjectHarnessArtifactTransitions,
} from "./project-harness-artifact-transitions.ts";
import type { DesiredHarnessArtifact, SkippedArtifactCollision } from "./reconcile.ts";

export { DECLARED_ARTIFACT_ACTIVATION_ACTIONS };
export type { DeclaredArtifactActivationAction };

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

export function preparedDeclaredArtifactActivationItemArtifactId(
	item: PreparedDeclaredArtifactActivation["artifacts"][number],
): string {
	return item.type === "remove" ? item.removal.entry.artifactId : item.artifact.id;
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
): Promise<
	Result<
		PreparedDeclaredArtifactActivation,
		HarnessArtifactProvisionErrorInfo | HarnessPathErrorInfo
	>
> {
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
	const manifests = await readProjectHarnessManifestSnapshots({ pathContext: context, fs });
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
						action: item.action,
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
		return {
			ok: true,
			completed: conflicts.map((item) =>
				outcomeForItem({ item, conflictingFiles: [], writtenFiles: [], removedFiles: [] }),
			),
		};
	}
	const applied = await applyProjectHarnessArtifactTransitions(prepared.reconciliation);
	if (!applied.ok) {
		return {
			ok: false,
			error: applied.error,
			completed: completedActivationOutcomes(
				prepared.artifacts.filter(
					(item) => item.action === "unchanged" || applied.error.completedTransitions.has(item.key),
				),
				applied.error.completedTransitions,
			),
		};
	}
	return {
		ok: true,
		completed: completedActivationOutcomes(prepared.artifacts, applied.value.outcomes),
	};
}

function completedActivationOutcomes(
	items: readonly PreparedDeclaredArtifactActivationItem[],
	transitions: ReadonlyMap<string, AppliedHarnessArtifactTransition>,
): readonly DeclaredArtifactActivationOutcome[] {
	return items.flatMap((item) => {
		if (item.action === "unchanged") {
			return [outcomeForItem({ item, conflictingFiles: [], writtenFiles: [], removedFiles: [] })];
		}
		const effects = appliedHarnessArtifactTransitionFileEffects(transitions, item.key);
		return [outcomeForItem({ item, ...effects })];
	});
}

interface OutcomeForItemOptions {
	readonly item: PreparedDeclaredArtifactActivationItem;
	readonly conflictingFiles: readonly string[];
	readonly writtenFiles: readonly string[];
	readonly removedFiles: readonly string[];
}

function outcomeForItem(options: OutcomeForItemOptions): DeclaredArtifactActivationOutcome {
	const { item, conflictingFiles, writtenFiles, removedFiles } = options;
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
