import { join } from "node:path";

import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

import {
	ALL_HARNESS_IDS,
	resolveHarnessSkillRoot,
	type HarnessId,
	type HarnessPathContext,
	type HarnessPathErrorInfo,
} from "./harness-paths.ts";
import {
	applyPreparedProvision,
	prepareProvision,
	provisionConflictingFiles,
	sequenceProvisionAfterEffects,
	type HarnessArtifactFileSystemGateway,
	type HarnessArtifactProvisionApplyOutcome,
	type HarnessArtifactProvisionErrorInfo,
	type PreparedHarnessArtifactProvision,
} from "./provision-apply.ts";
import {
	applyPreparedHarnessArtifactRemoval,
	preparePlannedHarnessArtifactRemoval,
	type PreparedHarnessArtifactRemoval,
} from "./provision-removal.ts";
import { INSTALL_MANIFEST_FILE_NAME, readInstallManifestAtRoot } from "./provision-manifest.ts";
import { installManifestKey } from "./provision-plan.ts";
import {
	planHarnessArtifactReconcile,
	type DesiredHarnessArtifact,
	type HarnessManifestSnapshot,
	type OrphanedManifestEntry,
	type PlannedHarnessArtifactRemoval,
	type ReconcileDeletionAuthority,
	type ReconcilePair,
	type SkippedArtifactCollision,
} from "./reconcile.ts";

export const HARNESS_ARTIFACT_PROVISION_ACTIONS = [
	"installed",
	"refreshed",
	"unchanged",
	"conflicted",
] as const;
export type HarnessArtifactProvisionAction = (typeof HARNESS_ARTIFACT_PROVISION_ACTIONS)[number];

export const DECLARED_ARTIFACT_ACTIVATION_ACTIONS = [
	...HARNESS_ARTIFACT_PROVISION_ACTIONS,
	"removed",
] as const;
export type DeclaredArtifactActivationAction =
	(typeof DECLARED_ARTIFACT_ACTIVATION_ACTIONS)[number];

export const HARNESS_ARTIFACT_RECONCILE_ACTIONS = [
	...DECLARED_ARTIFACT_ACTIVATION_ACTIONS,
	"skipped",
] as const;
export type HarnessArtifactReconcileAction = (typeof HARNESS_ARTIFACT_RECONCILE_ACTIONS)[number];

export type PreparedHarnessArtifactTransition =
	| {
			readonly type: "remove";
			readonly key: string;
			readonly removal: PreparedHarnessArtifactRemoval;
	  }
	| {
			readonly type: "provision";
			readonly key: string;
			readonly provision: PreparedHarnessArtifactProvision;
	  };

function createPreparedHarnessArtifactRemovalTransition(
	removal: PreparedHarnessArtifactRemoval,
): PreparedHarnessArtifactTransition {
	return { type: "remove", key: preparedTransitionIdentity({ type: "remove", removal }), removal };
}

function createPreparedHarnessArtifactProvisionTransition(
	provision: PreparedHarnessArtifactProvision,
): PreparedHarnessArtifactTransition {
	return {
		type: "provision",
		key: preparedTransitionIdentity({ type: "provision", provision }),
		provision,
	};
}

function preparedTransitionIdentity(
	transition:
		| { readonly type: "remove"; readonly removal: PreparedHarnessArtifactRemoval }
		| { readonly type: "provision"; readonly provision: PreparedHarnessArtifactProvision },
): string {
	return transition.type === "remove"
		? transition.removal.key
		: installManifestKey(transition.provision.plan);
}

export interface PreparedProvisionReconciliation {
	readonly transitions: readonly PreparedHarnessArtifactTransition[];
	readonly shouldForce: boolean;
}

export type AppliedHarnessArtifactTransition =
	| { readonly type: "remove"; readonly removedFiles: readonly string[] }
	| { readonly type: "provision"; readonly outcome: HarnessArtifactProvisionApplyOutcome };

export interface AppliedHarnessArtifactTransitionFileEffects {
	readonly writtenFiles: readonly string[];
	readonly removedFiles: readonly string[];
	readonly conflictingFiles: readonly string[];
}

/** Project an applied transition to the file effects shared by all callers. */
export function appliedHarnessArtifactTransitionFileEffects(
	outcomes: ReadonlyMap<string, AppliedHarnessArtifactTransition>,
	key: string,
): AppliedHarnessArtifactTransitionFileEffects {
	const transition = outcomes.get(key);
	if (transition === undefined) {
		throw new Error(`Applied harness artifact outcome is missing for ${key}.`);
	}
	if (transition.type === "remove") {
		return { writtenFiles: [], removedFiles: transition.removedFiles, conflictingFiles: [] };
	}
	if (transition.outcome.outcome === "conflicted") {
		return {
			writtenFiles: [],
			removedFiles: [],
			conflictingFiles: transition.outcome.conflictingFiles,
		};
	}
	return {
		writtenFiles: transition.outcome.writtenFiles,
		removedFiles: transition.outcome.removedFiles,
		conflictingFiles: [],
	};
}

export interface AppliedProvisionReconciliation {
	readonly outcomes: ReadonlyMap<string, AppliedHarnessArtifactTransition>;
}

export type HarnessArtifactProvisionReconciliationErrorInfo = HarnessArtifactProvisionErrorInfo & {
	readonly completedTransitions: ReadonlyMap<string, AppliedHarnessArtifactTransition>;
};

export type ProjectHarnessArtifactConflictPolicy =
	| { readonly type: "strict"; readonly shouldForce: false }
	| { readonly type: "force-capable"; readonly shouldForce: boolean };

export type PreparedProjectHarnessArtifactTransitionItem =
	| {
			readonly type: "remove";
			readonly key: string;
			readonly planned: PlannedHarnessArtifactRemoval;
			readonly removal: PreparedHarnessArtifactRemoval;
			readonly action: "removed" | "conflicted";
			readonly includedInApply: boolean;
			readonly conflictingFiles: readonly string[];
	  }
	| {
			readonly type: "provision";
			readonly key: string;
			readonly pair: ReconcilePair;
			readonly provision: PreparedHarnessArtifactProvision;
			readonly action: HarnessArtifactProvisionAction;
			readonly includedInApply: boolean;
			readonly conflictingFiles: readonly string[];
	  };

export interface PreparedProjectHarnessArtifactTransitions {
	readonly items: readonly PreparedProjectHarnessArtifactTransitionItem[];
	readonly transitions: readonly PreparedHarnessArtifactTransition[];
	readonly skippedDesired: readonly DesiredHarnessArtifact[];
	readonly skippedCollisions: readonly SkippedArtifactCollision[];
	readonly orphans: readonly OrphanedManifestEntry[];
	readonly conflictPolicy: ProjectHarnessArtifactConflictPolicy;
}

export function createEmptyPreparedProjectHarnessArtifactTransitions(
	conflictPolicy: ProjectHarnessArtifactConflictPolicy,
): PreparedProjectHarnessArtifactTransitions {
	return {
		items: [],
		transitions: [],
		skippedDesired: [],
		skippedCollisions: [],
		orphans: [],
		conflictPolicy,
	};
}

export interface PrepareProjectHarnessArtifactTransitionsRequest {
	readonly desired: readonly DesiredHarnessArtifact[];
	readonly selectedHarnesses: readonly HarnessId[] | undefined;
	readonly manifests: readonly HarnessManifestSnapshot[];
	readonly pathContext: HarnessPathContext;
	readonly trustedRepoRoot: string;
	readonly deletionAuthority?: ReconcileDeletionAuthority;
	readonly conflictPolicy: ProjectHarnessArtifactConflictPolicy;
	readonly fs: HarnessArtifactFileSystemGateway;
}

/** Prepare one ordered project harness-artifact desired-state transition. */
export async function prepareProjectHarnessArtifactTransitions(
	request: PrepareProjectHarnessArtifactTransitionsRequest,
): Promise<Result<PreparedProjectHarnessArtifactTransitions, HarnessArtifactProvisionErrorInfo>> {
	const plan = planHarnessArtifactReconcile({
		desired: request.desired,
		harnessSelection: request.selectedHarnesses,
		manifests: request.manifests,
		...(request.deletionAuthority === undefined
			? {}
			: { deletionAuthority: request.deletionAuthority }),
	});
	const items: PreparedProjectHarnessArtifactTransitionItem[] = [];
	const transitions: PreparedHarnessArtifactTransition[] = [];
	const precedingEffects = { removedPaths: new Set<string>(), removedKeys: new Set<string>() };
	assertUniqueTransitionKeys([
		...plan.removals.map((removal) => removal.key),
		...plan.pairs.map((pair) => pair.key),
	]);

	for (const planned of plan.removals) {
		const removal = await preparePlannedHarnessArtifactRemoval({
			planned,
			trustedBoundaryRoot: request.trustedRepoRoot,
			fs: request.fs,
		});
		if (!removal.ok) return removal;
		const transition = createPreparedHarnessArtifactRemovalTransition(removal.value);
		const conflictingFiles = removal.value.conflictingFiles;
		const action = conflictingFiles.length > 0 ? "conflicted" : "removed";
		const includedInApply = action === "removed";
		items.push({
			type: "remove",
			key: transition.key,
			planned,
			removal: removal.value,
			action,
			includedInApply,
			conflictingFiles,
		});
		if (includedInApply) {
			transitions.push(transition);
			precedingEffects.removedKeys.add(transition.key);
			for (const file of Object.values(planned.entry.files)) {
				precedingEffects.removedPaths.add(file.targetPath);
			}
		}
	}

	for (const pair of plan.pairs) {
		const provision = await prepareProvision({
			artifact: pair.desired.artifact,
			harness: pair.harness,
			scope: pair.scope,
			context: request.pathContext,
			sourceRoot: pair.desired.sourceRoot,
			sourceVersion: pair.desired.sourceVersion,
			fs: request.fs,
		});
		if (!provision.ok) return provision;
		const sequenced = sequenceProvisionAfterEffects(provision.value, precedingEffects);
		const conflictingFiles = provisionConflictingFiles(sequenced);
		const action = classifyProvisionAction({
			conflictingFiles,
			decisionsAreUnchanged: allProvisionFileDecisionsUnchanged(sequenced),
			hasManifestEntry:
				sequenced.manifest.artifacts[installManifestKey(sequenced.plan)] !== undefined &&
				!precedingEffects.removedKeys.has(installManifestKey(sequenced.plan)),
		});
		const transition = createPreparedHarnessArtifactProvisionTransition(sequenced);
		const includedInApply = action !== "unchanged";
		items.push({
			type: "provision",
			key: transition.key,
			pair,
			provision: sequenced,
			action,
			includedInApply,
			conflictingFiles,
		});
		if (includedInApply) transitions.push(transition);
	}
	assertUniquePreparedTransitionKeys(transitions);
	return resultOk({
		items,
		transitions,
		skippedDesired: plan.skippedDesired,
		skippedCollisions: plan.skippedCollisions,
		orphans: plan.orphans,
		conflictPolicy: request.conflictPolicy,
	});
}

export function assertUniquePreparedTransitionKeys(
	transitions: readonly PreparedHarnessArtifactTransition[],
): void {
	for (const transition of transitions) {
		const identity = preparedTransitionIdentity(transition);
		if (transition.key !== identity) {
			throw new Error(`Prepared harness artifact transition key drifted from ${identity}.`);
		}
	}
	assertUniqueTransitionKeys(transitions.map((transition) => transition.key));
}

function assertUniqueTransitionKeys(keys: readonly string[]): void {
	const seen = new Set<string>();
	for (const key of keys) {
		if (seen.has(key)) {
			throw new Error(`Duplicate prepared harness artifact transition key: ${key}.`);
		}
		seen.add(key);
	}
}

export function allProvisionFileDecisionsUnchanged(
	provision: PreparedHarnessArtifactProvision,
): boolean {
	return (
		provision.decisions.files.every((decision) => decision.type === "unchanged") &&
		provision.obsoleteFiles.length === 0
	);
}

export function classifyProvisionAction(input: {
	conflictingFiles: readonly string[];
	decisionsAreUnchanged: boolean;
	hasManifestEntry: boolean;
}): HarnessArtifactProvisionAction {
	if (input.conflictingFiles.length > 0) return "conflicted";
	if (input.decisionsAreUnchanged && input.hasManifestEntry) return "unchanged";
	if (input.hasManifestEntry) return "refreshed";
	return "installed";
}

export async function readProjectHarnessManifestSnapshots(input: {
	pathContext: HarnessPathContext;
	fs: HarnessArtifactFileSystemGateway;
}): Promise<
	Result<
		readonly HarnessManifestSnapshot[],
		HarnessArtifactProvisionErrorInfo | HarnessPathErrorInfo
	>
> {
	const snapshots: HarnessManifestSnapshot[] = [];
	for (const harness of ALL_HARNESS_IDS) {
		const root = resolveHarnessSkillRoot({
			harness,
			scope: "project",
			context: input.pathContext,
		});
		if (!root.ok) return root;
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

/** Apply one ordered reconciliation while rereading each transition's immediate state. */
export async function applyPreparedProvisionReconciliation(
	prepared: PreparedProvisionReconciliation,
): Promise<
	Result<AppliedProvisionReconciliation, HarnessArtifactProvisionReconciliationErrorInfo>
> {
	assertUniquePreparedTransitionKeys(prepared.transitions);
	const outcomes = new Map<string, AppliedHarnessArtifactTransition>();
	for (const transition of prepared.transitions) {
		if (transition.type === "remove") {
			const removed = await applyPreparedHarnessArtifactRemoval(transition.removal);
			if (!removed.ok) {
				return resultErr({ ...removed.error, completedTransitions: new Map(outcomes) });
			}
			outcomes.set(transition.key, { type: "remove", removedFiles: removed.value });
			continue;
		}
		const applied = await applyPreparedProvision(transition.provision, {
			shouldForce: prepared.shouldForce,
		});
		if (!applied.ok) {
			return resultErr({ ...applied.error, completedTransitions: new Map(outcomes) });
		}
		outcomes.set(transition.key, { type: "provision", outcome: applied.value });
	}
	return resultOk({ outcomes });
}

/** Apply prepared project transitions with the caller's explicit conflict policy. */
export async function applyProjectHarnessArtifactTransitions(
	prepared: PreparedProjectHarnessArtifactTransitions,
): Promise<
	Result<AppliedProvisionReconciliation, HarnessArtifactProvisionReconciliationErrorInfo>
> {
	if (
		prepared.conflictPolicy.type === "strict" &&
		prepared.items.some((item) => item.conflictingFiles.length > 0)
	) {
		return resultOk({ outcomes: new Map() });
	}
	return applyPreparedProvisionReconciliation({
		transitions: prepared.transitions,
		shouldForce: prepared.conflictPolicy.shouldForce,
	});
}
