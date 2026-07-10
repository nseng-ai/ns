import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

import type { HarnessId, HarnessPathContext } from "./harness-paths.ts";
import {
	applyPreparedProvision,
	classifyProvisionAction,
	prepareProvision,
	provisionConflictingFiles,
	type HarnessArtifactFileSystemGateway,
	type HarnessArtifactProvisionApplyOutcome,
	type HarnessArtifactProvisionErrorInfo,
	type PreparedHarnessArtifactProvision,
} from "./provision-apply.ts";
import {
	applyPreparedHarnessArtifactRemoval,
	prepareHarnessArtifactRemoval,
	type PreparedHarnessArtifactRemoval,
} from "./provision-removal.ts";
import { installManifestKey, type TargetFileHashFact } from "./provision-plan.ts";
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

export interface PreparedProvisionReconciliation {
	readonly transitions: readonly PreparedHarnessArtifactTransition[];
	readonly shouldForce: boolean;
}

export type AppliedHarnessArtifactTransition =
	| { readonly type: "remove"; readonly removedFiles: readonly string[] }
	| { readonly type: "provision"; readonly outcome: HarnessArtifactProvisionApplyOutcome };

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
			readonly conflictingFiles: readonly string[];
	  }
	| {
			readonly type: "provision";
			readonly key: string;
			readonly pair: ReconcilePair;
			readonly provision: PreparedHarnessArtifactProvision;
			readonly action: "installed" | "refreshed" | "unchanged" | "conflicted";
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

	for (const planned of plan.removals) {
		const removal = await prepareHarnessArtifactRemoval({
			key: planned.key,
			reason: planned.reason,
			entry: planned.entry,
			expectedHarness: planned.snapshot.harness,
			expectedTargetRoot: planned.snapshot.targetRoot,
			trustedBoundaryRoot: request.trustedRepoRoot,
			manifestPath: planned.snapshot.manifestPath,
			fs: request.fs,
		});
		if (!removal.ok) return removal;
		items.push({
			type: "remove",
			key: planned.key,
			planned,
			removal: removal.value,
			conflictingFiles: removal.value.conflictingFiles,
		});
		if (removal.value.conflictingFiles.length === 0) {
			transitions.push({ type: "remove", key: planned.key, removal: removal.value });
			precedingEffects.removedKeys.add(planned.key);
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
			decisionsAreUnchanged:
				sequenced.decisions.files.every((decision) => decision.type === "unchanged") &&
				sequenced.obsoleteFiles.length === 0,
			hasManifestEntry:
				sequenced.manifest.artifacts[installManifestKey(sequenced.plan)] !== undefined &&
				!precedingEffects.removedKeys.has(installManifestKey(sequenced.plan)),
		});
		const key = installManifestKey(sequenced.plan);
		items.push({ type: "provision", key, pair, provision: sequenced, action, conflictingFiles });
		if (action !== "unchanged") {
			transitions.push({ type: "provision", key, provision: sequenced });
		}
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
	const keys = new Set<string>();
	for (const transition of transitions) {
		const identityKey =
			transition.type === "remove"
				? transition.removal.key
				: installManifestKey(transition.provision.plan);
		if (transition.key !== identityKey) {
			throw new Error(
				`Prepared harness artifact transition key ${transition.key} does not match ${identityKey}.`,
			);
		}
		if (keys.has(transition.key)) {
			throw new Error(`Duplicate prepared harness artifact transition key: ${transition.key}.`);
		}
		keys.add(transition.key);
	}
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

function sequenceProvisionAfterEffects(
	provision: PreparedHarnessArtifactProvision,
	effects: {
		readonly removedPaths: ReadonlySet<string>;
		readonly removedKeys: ReadonlySet<string>;
	},
): PreparedHarnessArtifactProvision {
	const key = installManifestKey(provision.plan);
	const wasRemoved = (fact: TargetFileHashFact): boolean =>
		effects.removedPaths.has(fact.targetPath);
	if (!effects.removedKeys.has(key) && !provision.targetFacts.some(wasRemoved)) return provision;
	return {
		...provision,
		expectedManifestEntry: effects.removedKeys.has(key)
			? undefined
			: provision.expectedManifestEntry,
		targetFacts: provision.targetFacts.map((fact) =>
			wasRemoved(fact) ? { type: "missing" as const, targetPath: fact.targetPath } : fact,
		),
		decisions: {
			...provision.decisions,
			files: provision.decisions.files.map((decision) =>
				effects.removedPaths.has(decision.file.targetPath)
					? { type: "fresh-write" as const, file: decision.file }
					: decision,
			),
		},
	};
}
