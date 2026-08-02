import { join, resolve } from "node:path";

import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

import {
	ALL_HARNESS_IDS,
	resolveHarnessSkillRoot,
	resolveHarnessTrustedBoundaryRoot,
	type HarnessId,
	type HarnessPathContext,
	type HarnessScope,
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
import {
	INSTALL_MANIFEST_FILE_NAME,
	readInstallManifestAtRoot,
	validateManifestEntryCoherence,
} from "./provision-manifest.ts";
import { unsafeManifestEntry } from "./provision-errors.ts";
import { installManifestKey } from "./provision-plan.ts";
import type { HarnessArtifactProvisionAction } from "./reconcile-actions.ts";
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

export {
	DECLARED_ARTIFACT_ACTIVATION_ACTIONS,
	HARNESS_ARTIFACT_PROVISION_ACTIONS,
	type DeclaredArtifactActivationAction,
	type HarnessArtifactProvisionAction,
} from "./reconcile-actions.ts";

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

export type HarnessArtifactConflictPolicy =
	| { readonly type: "strict"; readonly shouldForce: false }
	| { readonly type: "force-capable"; readonly shouldForce: boolean };

export type PreparedHarnessArtifactTransitionItem =
	| {
			readonly type: "remove";
			readonly key: string;
			readonly planned: PlannedHarnessArtifactRemoval;
			readonly removal: PreparedHarnessArtifactRemoval;
			readonly action: "removed" | "conflicted";
			readonly isIncludedInApply: boolean;
			readonly conflictingFiles: readonly string[];
	  }
	| {
			readonly type: "provision";
			readonly key: string;
			readonly pair: ReconcilePair;
			readonly provision: PreparedHarnessArtifactProvision;
			readonly action: HarnessArtifactProvisionAction;
			readonly isIncludedInApply: boolean;
			readonly conflictingFiles: readonly string[];
	  };

export interface PreparedHarnessArtifactTransitions {
	readonly items: readonly PreparedHarnessArtifactTransitionItem[];
	readonly transitions: readonly PreparedHarnessArtifactTransition[];
	readonly skippedDesired: readonly DesiredHarnessArtifact[];
	readonly skippedCollisions: readonly SkippedArtifactCollision[];
	readonly orphans: readonly OrphanedManifestEntry[];
	readonly conflictPolicy: HarnessArtifactConflictPolicy;
}

export function createEmptyPreparedHarnessArtifactTransitions(
	conflictPolicy: HarnessArtifactConflictPolicy,
): PreparedHarnessArtifactTransitions {
	return {
		items: [],
		transitions: [],
		skippedDesired: [],
		skippedCollisions: [],
		orphans: [],
		conflictPolicy,
	};
}

export interface PrepareHarnessArtifactTransitionsRequest {
	readonly scope: HarnessScope;
	readonly desired: readonly DesiredHarnessArtifact[];
	readonly selectedHarnesses: readonly HarnessId[] | undefined;
	readonly manifests: readonly HarnessManifestSnapshot[];
	readonly pathContext: HarnessPathContext;
	readonly deletionAuthority?: ReconcileDeletionAuthority;
	readonly conflictPolicy: HarnessArtifactConflictPolicy;
	readonly fs: HarnessArtifactFileSystemGateway;
}

/** Prepare one ordered scope-aware harness-artifact desired-state transition. */
export async function prepareHarnessArtifactTransitions(
	request: PrepareHarnessArtifactTransitionsRequest,
): Promise<
	Result<
		PreparedHarnessArtifactTransitions,
		HarnessArtifactProvisionErrorInfo | HarnessPathErrorInfo
	>
> {
	const manifestSafety = validateManifestSnapshotsForMutation(request);
	if (!manifestSafety.ok) return manifestSafety;
	const plan = planHarnessArtifactReconcile({
		scope: request.scope,
		desired: request.desired,
		harnessSelection: request.selectedHarnesses,
		manifests: request.manifests,
		...(request.deletionAuthority === undefined
			? {}
			: { deletionAuthority: request.deletionAuthority }),
	});
	const items: PreparedHarnessArtifactTransitionItem[] = [];
	const transitions: PreparedHarnessArtifactTransition[] = [];
	const precedingEffects = { removedPaths: new Set<string>(), removedKeys: new Set<string>() };
	assertUniqueTransitionKeys([
		...plan.removals.map((removal) => removal.key),
		...plan.pairs.map((pair) => pair.key),
	]);

	for (const planned of plan.removals) {
		const boundary = resolveHarnessTrustedBoundaryRoot({
			harness: planned.entry.harness,
			scope: request.scope,
			context: request.pathContext,
		});
		if (!boundary.ok) return boundary;
		const removal = await preparePlannedHarnessArtifactRemoval({
			planned,
			expectedScope: request.scope,
			trustedBoundaryRoot: boundary.value.rootPath,
			fs: request.fs,
		});
		if (!removal.ok) return removal;
		const transition = createPreparedHarnessArtifactRemovalTransition(removal.value);
		const conflictingFiles = removal.value.conflictingFiles;
		const action = conflictingFiles.length > 0 ? "conflicted" : "removed";
		const isIncludedInApply = action === "removed";
		items.push({
			type: "remove",
			key: transition.key,
			planned,
			removal: removal.value,
			action,
			isIncludedInApply,
			conflictingFiles,
		});
		if (isIncludedInApply) {
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
		const targetedPackageNames =
			request.deletionAuthority?.type === "targeted"
				? request.deletionAuthority.packageNames
				: undefined;
		const unauthorizedTargetOwner =
			targetedPackageNames !== undefined
				? request.manifests
						.flatMap((snapshot) => Object.values(snapshot.manifest.artifacts))
						.find(
							(entry) =>
								entry.scope === request.scope &&
								entry.harness === pair.harness &&
								entry.provisionName === pair.desired.artifact.skillName &&
								!targetedPackageNames.includes(entry.source.packageName),
						)
				: undefined;
		const conflictingFiles = [
			...new Set([
				...provisionConflictingFiles(sequenced),
				...Object.values(unauthorizedTargetOwner?.files ?? {}).map((file) => file.targetPath),
			]),
		].sort((left, right) => left.localeCompare(right));
		const action = classifyProvisionAction({
			conflictingFiles,
			isEveryDecisionUnchanged: allProvisionFileDecisionsUnchanged(sequenced),
			hasManifestEntry:
				sequenced.manifest.artifacts[installManifestKey(sequenced.plan)] !== undefined &&
				!precedingEffects.removedKeys.has(installManifestKey(sequenced.plan)),
		});
		const transition = createPreparedHarnessArtifactProvisionTransition(sequenced);
		const isIncludedInApply = action !== "unchanged" && unauthorizedTargetOwner === undefined;
		items.push({
			type: "provision",
			key: transition.key,
			pair,
			provision: sequenced,
			action,
			isIncludedInApply,
			conflictingFiles,
		});
		if (isIncludedInApply) transitions.push(transition);
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

function validateManifestSnapshotsForMutation(
	request: PrepareHarnessArtifactTransitionsRequest,
): Result<void, HarnessArtifactProvisionErrorInfo> {
	const ownerByTargetPath = new Map<string, { readonly key: string }>();
	for (const snapshot of request.manifests) {
		for (const [key, entry] of Object.entries(snapshot.manifest.artifacts)) {
			const unsafePath = validateManifestEntryCoherence({
				key,
				entry,
				expectedHarness: snapshot.harness,
				expectedScope: request.scope,
				expectedTargetRoot: snapshot.targetRoot,
			});
			if (unsafePath !== undefined) {
				return unsafeManifestEntry(snapshot.manifestPath, key, unsafePath);
			}
			const targetPath = resolve(entry.targetArtifactPath);
			const owner = ownerByTargetPath.get(targetPath);
			if (owner !== undefined && owner.key !== key) {
				return unsafeManifestEntry(snapshot.manifestPath, key, entry.targetArtifactPath);
			}
			ownerByTargetPath.set(targetPath, { key });
		}
	}
	return resultOk(undefined);
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
	isEveryDecisionUnchanged: boolean;
	hasManifestEntry: boolean;
}): HarnessArtifactProvisionAction {
	if (input.conflictingFiles.length > 0) return "conflicted";
	if (input.isEveryDecisionUnchanged && input.hasManifestEntry) return "unchanged";
	if (input.hasManifestEntry) return "refreshed";
	return "installed";
}

export async function readHarnessManifestSnapshots(input: {
	scope: HarnessScope;
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
			scope: input.scope,
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

/** Apply prepared transitions with the caller's explicit conflict policy. */
export async function applyHarnessArtifactTransitions(
	prepared: PreparedHarnessArtifactTransitions,
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
