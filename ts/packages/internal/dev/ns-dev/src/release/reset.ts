import { createHash } from "node:crypto";
import { isAbsolute, relative, sep } from "node:path";

import { z } from "zod";

import { intendedPublicPackages, isConcreteNpmVersion } from "../public-packages/package-set.ts";

import {
	concreteNpmVersionSchema,
	releaseFailureSchema,
	releaseResetTrackedChangeSchema,
	releaseTransactionStageSchema,
	type ReleaseResetGateway,
	type ReleaseResetInspection,
	type ReleaseResetManifestState,
	type ReleaseResetReportState,
	type ReleaseTransactionReport,
} from "./contracts.ts";
import { orderedReleaseInventory, releaseBranchName } from "./fresh.ts";

const nonemptyStringSchema = z.string().min(1);

export const releaseResetRefusalCodes = [
	"invalid-version",
	"reset-inspection-failed",
	"release-branch-exists",
	"release-branch-mismatch",
	"report-read-error",
	"report-parse-error",
	"report-stage-unsafe",
	"report-version-mismatch",
	"report-branch-mismatch",
	"report-commit-not-ancestor",
	"report-inventory-mismatch",
	"report-candidate-inventory-mismatch",
	"report-has-completed-writes",
	"report-has-pending-write",
	"manifest-inventory-mismatch",
	"release-directory-state-invalid",
	"unexpected-tracked-path",
	"unexpected-untracked-path",
	"tracked-change-state-invalid",
	"manifest-change-state-mismatch",
	"manifest-non-version-change",
	"manifest-working-version-mismatch",
	"state-changed-after-authorization",
	"tracked-restore-failed",
	"release-directory-remove-failed",
	"post-reset-inspection-failed",
	"reset-incomplete",
] as const;
export const releaseResetRefusalCodeSchema = z.enum(releaseResetRefusalCodes);

export const releaseResetActionSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("restore-tracked-paths"),
		paths: z.array(nonemptyStringSchema).readonly(),
	}),
	z.strictObject({
		type: z.literal("remove-release-directory"),
		path: nonemptyStringSchema,
	}),
]);

export const releaseResetReportEvidenceSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("missing") }),
	z.strictObject({
		type: z.literal("found"),
		stage: releaseTransactionStageSchema,
		branch: nonemptyStringSchema,
		commit: nonemptyStringSchema,
		isCommitStale: z.boolean(),
		isCommitAncestorOfHead: z.boolean(),
	}),
	z.strictObject({
		type: z.literal("error"),
		errorType: z.enum(["read-error", "parse-error"]),
		error: releaseFailureSchema,
	}),
]);

export const releaseResetEvidenceSchema = z.strictObject({
	version: concreteNpmVersionSchema,
	currentSourceBranch: nonemptyStringSchema,
	headCommit: nonemptyStringSchema,
	report: releaseResetReportEvidenceSchema,
	releaseBranch: nonemptyStringSchema,
	releaseBranchExists: z.boolean(),
	inspectionFingerprint: nonemptyStringSchema,
	trackedChanges: z.array(releaseResetTrackedChangeSchema).readonly(),
	trackedPathsToRestore: z.array(nonemptyStringSchema).readonly(),
	releaseDirectory: nonemptyStringSchema.nullable(),
	releaseDirectoryFingerprint: nonemptyStringSchema.nullable(),
	plannedActions: z.array(releaseResetActionSchema).readonly(),
	completedActions: z.array(releaseResetActionSchema).readonly(),
});

const releaseResetAlreadyCleanSchema = releaseResetEvidenceSchema.extend({
	outcome: z.literal("already-clean"),
});
const releaseResetPlanSchema = releaseResetEvidenceSchema.extend({
	outcome: z.literal("reset-planned"),
	fingerprint: nonemptyStringSchema,
});
const releaseResetRefusalSchema = z.strictObject({
	outcome: z.literal("refused"),
	code: releaseResetRefusalCodeSchema,
	guidance: nonemptyStringSchema,
	evidence: releaseResetEvidenceSchema.nullable(),
	failure: releaseFailureSchema.optional(),
});
export const releaseResetPlanResultSchema = z.discriminatedUnion("outcome", [
	releaseResetAlreadyCleanSchema,
	releaseResetPlanSchema,
	releaseResetRefusalSchema,
]);

const releaseResetCompletedSchema = releaseResetEvidenceSchema.extend({
	outcome: z.literal("reset"),
});
const releaseResetDeclinedSchema = releaseResetEvidenceSchema.extend({
	outcome: z.literal("declined"),
});
export const releaseResetResultSchema = z.discriminatedUnion("outcome", [
	releaseResetAlreadyCleanSchema,
	releaseResetPlanSchema,
	releaseResetCompletedSchema,
	releaseResetDeclinedSchema,
	releaseResetRefusalSchema,
]);

type ReleaseResetFailure = z.infer<typeof releaseFailureSchema>;
export type ReleaseResetRefusalCode = z.infer<typeof releaseResetRefusalCodeSchema>;
export type ReleaseResetAction = z.infer<typeof releaseResetActionSchema>;
export type ReleaseResetReportEvidence = z.infer<typeof releaseResetReportEvidenceSchema>;
export type ReleaseResetEvidence = z.infer<typeof releaseResetEvidenceSchema>;
export type ReleaseResetPlan = z.infer<typeof releaseResetPlanSchema>;
export type ReleaseResetPlanResult = z.infer<typeof releaseResetPlanResultSchema>;
export type ReleaseResetResult = z.infer<typeof releaseResetResultSchema>;

/** Inspects release-reset state and returns an authorization-ready plan without mutation. */
export async function planReleaseReset(
	gateway: ReleaseResetGateway,
	version: string,
): Promise<ReleaseResetPlanResult> {
	if (!isConcreteNpmVersion(version)) {
		return refuse(
			"invalid-version",
			`Use a concrete npm version instead of ${JSON.stringify(version)}.`,
			null,
		);
	}
	const releaseBranch = releaseBranchName(version);
	const inspected = await gateway.inspectResetState({ version, releaseBranch });
	if (!inspected.ok) {
		return refuse(
			"reset-inspection-failed",
			"Resolve the inspection failure, then inspect and authorize a new reset plan.",
			null,
			inspected.error,
		);
	}
	return classifyReleaseReset(version, inspected.value);
}

/** Purely classifies one concrete-version semantic inspection snapshot. */
export function classifyReleaseReset(
	version: string,
	inspection: ReleaseResetInspection,
): ReleaseResetPlanResult {
	if (!isConcreteNpmVersion(version)) {
		return refuse(
			"invalid-version",
			`Use a concrete npm version instead of ${JSON.stringify(version)}.`,
			null,
		);
	}

	const evidence = buildEvidence(version, inspection, []);
	if (inspection.releaseBranch !== releaseBranchName(version)) {
		return refuse(
			"release-branch-mismatch",
			"Re-inspect the deterministic release branch before resetting.",
			evidence,
		);
	}
	if (inspection.releaseBranchExists) {
		return refuse(
			"release-branch-exists",
			`Keep or remove ${inspection.releaseBranch} deliberately; reset never deletes branches.`,
			evidence,
		);
	}
	if (
		(inspection.releaseDirectory === null) !==
		(inspection.releaseDirectoryFingerprint === null)
	) {
		return refuse(
			"release-directory-state-invalid",
			"Re-inspect the exact release directory and its complete contents before resetting.",
			evidence,
		);
	}

	const reportRefusal = validateReport(inspection.report, version, inspection, evidence);
	if (reportRefusal !== undefined) return reportRefusal;

	const manifestInventoryRefusal = validateManifestInventory(inspection.manifests, evidence);
	if (manifestInventoryRefusal !== undefined) return manifestInventoryRefusal;
	if (inspection.untrackedPaths.length > 0) {
		return refuse(
			"unexpected-untracked-path",
			`Move or remove unexpected untracked paths before resetting: ${sortedUnique(inspection.untrackedPaths).join(", ")}.`,
			evidence,
		);
	}

	const manifestByPath = new Map(inspection.manifests.map((manifest) => [manifest.path, manifest]));
	const trackedPaths = new Set<string>();
	for (const change of inspection.trackedChanges) {
		if (trackedPaths.has(change.path) || (!change.indexChanged && !change.worktreeChanged)) {
			return refuse(
				"tracked-change-state-invalid",
				"Re-inspect tracked state; each changed path must appear once with an index or worktree change.",
				evidence,
			);
		}
		trackedPaths.add(change.path);
		if (
			change.isUnexpectedStatus === true ||
			(change.path !== "ts/pnpm-lock.yaml" && !manifestByPath.has(change.path))
		) {
			return refuse(
				"unexpected-tracked-path",
				`Restore or preserve unexpected tracked path ${change.path} separately before resetting.`,
				evidence,
			);
		}
	}

	for (const manifest of inspection.manifests) {
		const isTracked = trackedPaths.has(manifest.path);
		if (isTracked !== manifest.changedFields.length > 0) {
			return refuse(
				"manifest-change-state-mismatch",
				`Re-inspect ${manifest.path}; its manifest diff and tracked status disagree.`,
				evidence,
			);
		}
		if (!isTracked) continue;
		if (
			manifest.changedFields.length !== 1 ||
			manifest.changedFields[0] !== "version" ||
			manifest.headVersion === manifest.workingVersion
		) {
			return refuse(
				"manifest-non-version-change",
				`Preserve or revert non-version edits in ${manifest.path} before resetting.`,
				evidence,
			);
		}
		if (manifest.workingVersion !== version) {
			return refuse(
				"manifest-working-version-mismatch",
				`${manifest.path} must contain requested version ${version} before it can be reset.`,
				evidence,
			);
		}
		if (!manifest.isExactVersionOnlyChange) {
			return refuse(
				"manifest-non-version-change",
				`Preserve or revert byte-level representation changes in ${manifest.path} before resetting.`,
				evidence,
			);
		}
	}

	if (evidence.plannedActions.length === 0) return { outcome: "already-clean", ...evidence };
	const planWithoutFingerprint = { outcome: "reset-planned" as const, ...evidence };
	return { ...planWithoutFingerprint, fingerprint: fingerprint(planWithoutFingerprint) };
}

/** Revalidates an approved exact plan, then executes its ordered cleanup effects. */
export async function applyReleaseReset(
	gateway: ReleaseResetGateway,
	approvedPlan: ReleaseResetPlan,
): Promise<ReleaseResetResult> {
	const revalidated = await planReleaseReset(gateway, approvedPlan.version);
	if (
		revalidated.outcome !== "reset-planned" ||
		revalidated.fingerprint !== approvedPlan.fingerprint ||
		JSON.stringify(revalidated) !== JSON.stringify(approvedPlan)
	) {
		return refuse(
			"state-changed-after-authorization",
			"No reset effects ran. Inspect the changed state and authorize a new exact plan.",
			revalidated.outcome === "refused" ? revalidated.evidence : revalidated,
		);
	}

	const completedActions: ReleaseResetAction[] = [];
	for (const action of approvedPlan.plannedActions) {
		const effect =
			action.type === "restore-tracked-paths"
				? await gateway.restoreTrackedReleasePaths([...action.paths])
				: await gateway.removeReleaseDirectory({
						version: approvedPlan.version,
						plannedPath: action.path,
					});
		if (!effect.ok) {
			return await failureAfterEffect(
				gateway,
				approvedPlan,
				completedActions,
				action.type === "restore-tracked-paths"
					? "tracked-restore-failed"
					: "release-directory-remove-failed",
				effect.error,
			);
		}
		completedActions.push(copyAction(action));
	}

	const residual = await planReleaseReset(gateway, approvedPlan.version);
	if (residual.outcome === "already-clean") {
		return {
			outcome: "reset",
			...buildEvidenceFromEvidence(residual, approvedPlan.plannedActions, completedActions),
		};
	}
	if (residual.outcome === "refused" && residual.code === "reset-inspection-failed") {
		return refuse(
			"post-reset-inspection-failed",
			"Cleanup effects completed, but final state could not be inspected; inspect before retrying.",
			withCompletedActions(approvedPlan, completedActions),
			residual.failure,
		);
	}
	return refuse(
		"reset-incomplete",
		"Residual release state remains after cleanup; inspect it before retrying.",
		residual.outcome === "refused"
			? withCompletedActions(approvedPlan, completedActions)
			: buildEvidenceFromEvidence(residual, approvedPlan.plannedActions, completedActions),
	);
}

function validateReport(
	reportState: ReleaseResetReportState,
	version: string,
	inspection: ReleaseResetInspection,
	evidence: ReleaseResetEvidence,
): Extract<ReleaseResetPlanResult, { readonly outcome: "refused" }> | undefined {
	if (reportState.type === "missing") return undefined;
	if (reportState.type === "error") {
		return refuse(
			reportState.errorType === "read-error" ? "report-read-error" : "report-parse-error",
			"Repair or remove the unreadable release report only after preserving any needed evidence.",
			evidence,
			reportState.error,
		);
	}
	const report = reportState.report;
	if (
		report.stage === "checkpointing" ||
		report.stage === "publishing" ||
		report.stage === "published" ||
		report.stage === "verified"
	) {
		return refuse(
			"report-stage-unsafe",
			`Report stage ${report.stage} may include durable release effects; use release recovery instead.`,
			evidence,
		);
	}
	if (report.release.version !== version) {
		return refuse(
			"report-version-mismatch",
			`Request the report version ${report.release.version}, or preserve this report and reset separately.`,
			evidence,
		);
	}
	if (report.release.branch !== inspection.currentSourceBranch) {
		return refuse(
			"report-branch-mismatch",
			`Switch to recorded source branch ${report.release.branch}, or preserve this report and reset separately.`,
			evidence,
		);
	}
	if (!reportState.isCommitAncestorOfHead) {
		return refuse(
			"report-commit-not-ancestor",
			"Preserve the report; its recorded commit is not proven to be an ancestor of HEAD.",
			evidence,
		);
	}
	if (!sameOrderedValues(report.inventory, orderedReleaseInventory())) {
		return refuse(
			"report-inventory-mismatch",
			"Preserve the report and reconcile it with the canonical public package inventory.",
			evidence,
		);
	}
	if (report.completedWrites.length > 0) {
		return refuse(
			"report-has-completed-writes",
			"Published writes are recorded; use release recovery and never reset this transaction.",
			evidence,
		);
	}
	if (report.pendingWrite !== null) {
		return refuse(
			"report-has-pending-write",
			"A pending registry write is recorded; use release recovery and never reset this transaction.",
			evidence,
		);
	}
	if (!hasCanonicalResetCandidates(report, version, inspection.releaseDirectory)) {
		return refuse(
			"report-candidate-inventory-mismatch",
			"Preserve the report and reconcile its candidates with the canonical ordered release inventory and exact release directory.",
			evidence,
		);
	}
	return undefined;
}

function hasCanonicalResetCandidates(
	report: ReleaseTransactionReport,
	version: string,
	releaseDirectory: string | null,
): boolean {
	const canonicalInventory = orderedReleaseInventory();
	if (report.candidates.length > canonicalInventory.length) return false;
	if (
		report.stage === "candidates-prepared" &&
		report.candidates.length !== canonicalInventory.length
	) {
		return false;
	}
	const names = new Set<string>();
	const orders = new Set<number>();
	const tarballPaths = new Set<string>();
	for (const [index, candidate] of report.candidates.entries()) {
		if (
			candidate.name !== canonicalInventory[index] ||
			candidate.version !== version ||
			candidate.order !== index ||
			names.has(candidate.name) ||
			orders.has(candidate.order) ||
			tarballPaths.has(candidate.tarballPath)
		) {
			return false;
		}
		names.add(candidate.name);
		orders.add(candidate.order);
		tarballPaths.add(candidate.tarballPath);
		if (releaseDirectory === null || !isAbsolute(candidate.tarballPath)) return false;
		const relativeTarballPath = relative(releaseDirectory, candidate.tarballPath);
		if (
			relativeTarballPath.length === 0 ||
			isAbsolute(relativeTarballPath) ||
			relativeTarballPath === ".." ||
			relativeTarballPath.startsWith(`..${sep}`)
		) {
			return false;
		}
	}
	return true;
}

function validateManifestInventory(
	manifests: readonly ReleaseResetManifestState[],
	evidence: ReleaseResetEvidence,
): Extract<ReleaseResetPlanResult, { readonly outcome: "refused" }> | undefined {
	const names = manifests.map((manifest) => manifest.packageName);
	const paths = manifests.map((manifest) => manifest.path);
	if (
		new Set(names).size !== names.length ||
		new Set(paths).size !== paths.length ||
		!sameOrderedValues(sortedUnique(names), sortedUnique(intendedPublicPackages))
	) {
		return refuse(
			"manifest-inventory-mismatch",
			"Re-inspect the exact intended public source manifest inventory before resetting.",
			evidence,
		);
	}
	return undefined;
}

function buildEvidence(
	version: string,
	inspection: ReleaseResetInspection,
	completedActions: readonly ReleaseResetAction[],
): ReleaseResetEvidence {
	const trackedChanges = [...inspection.trackedChanges]
		.map((change) => ({ ...change }))
		.sort((left, right) => left.path.localeCompare(right.path));
	const trackedPathsToRestore = trackedChanges.map((change) => change.path);
	const plannedActions: ReleaseResetAction[] = [];
	if (trackedPathsToRestore.length > 0) {
		plannedActions.push({ type: "restore-tracked-paths", paths: [...trackedPathsToRestore] });
	}
	if (inspection.releaseDirectory !== null) {
		plannedActions.push({
			type: "remove-release-directory",
			path: inspection.releaseDirectory,
		});
	}
	return {
		version,
		currentSourceBranch: inspection.currentSourceBranch,
		headCommit: inspection.headCommit,
		report: reportEvidence(inspection.report, inspection.headCommit),
		releaseBranch: inspection.releaseBranch,
		releaseBranchExists: inspection.releaseBranchExists,
		inspectionFingerprint: inspectionFingerprint(inspection),
		trackedChanges,
		trackedPathsToRestore,
		releaseDirectory: inspection.releaseDirectory,
		releaseDirectoryFingerprint: inspection.releaseDirectoryFingerprint,
		plannedActions: plannedActions.map(copyAction),
		completedActions: completedActions.map(copyAction),
	};
}

function reportEvidence(
	state: ReleaseResetReportState,
	headCommit: string,
): ReleaseResetReportEvidence {
	if (state.type === "missing") return { type: "missing" };
	if (state.type === "error") {
		return { type: "error", errorType: state.errorType, error: { ...state.error } };
	}
	return {
		type: "found",
		stage: state.report.stage,
		branch: state.report.release.branch,
		commit: state.report.release.commit,
		isCommitStale: state.report.release.commit !== headCommit,
		isCommitAncestorOfHead: state.isCommitAncestorOfHead,
	};
}

async function failureAfterEffect(
	gateway: ReleaseResetGateway,
	approvedPlan: ReleaseResetPlan,
	completedActions: readonly ReleaseResetAction[],
	code: "tracked-restore-failed" | "release-directory-remove-failed",
	failure: ReleaseResetFailure,
): Promise<ReleaseResetResult> {
	const residual = await planReleaseReset(gateway, approvedPlan.version);
	const evidence =
		residual.outcome === "refused"
			? withCompletedActions(approvedPlan, completedActions)
			: buildEvidenceFromEvidence(residual, approvedPlan.plannedActions, completedActions);
	return refuse(
		code,
		"The cleanup is retryable. Inspect the residual state and authorize its new exact plan.",
		evidence,
		failure,
	);
}

function withCompletedActions(
	evidence: ReleaseResetEvidence,
	completedActions: readonly ReleaseResetAction[],
): ReleaseResetEvidence {
	return buildEvidenceFromEvidence(evidence, evidence.plannedActions, completedActions);
}

function buildEvidenceFromEvidence(
	evidence: ReleaseResetEvidence,
	plannedActions: readonly ReleaseResetAction[],
	completedActions: readonly ReleaseResetAction[],
): ReleaseResetEvidence {
	return {
		version: evidence.version,
		currentSourceBranch: evidence.currentSourceBranch,
		headCommit: evidence.headCommit,
		report: copyReportEvidence(evidence.report),
		releaseBranch: evidence.releaseBranch,
		releaseBranchExists: evidence.releaseBranchExists,
		inspectionFingerprint: evidence.inspectionFingerprint,
		trackedChanges: evidence.trackedChanges.map((change) => ({ ...change })),
		trackedPathsToRestore: [...evidence.trackedPathsToRestore],
		releaseDirectory: evidence.releaseDirectory,
		releaseDirectoryFingerprint: evidence.releaseDirectoryFingerprint,
		plannedActions: plannedActions.map(copyAction),
		completedActions: completedActions.map(copyAction),
	};
}

function copyReportEvidence(evidence: ReleaseResetReportEvidence): ReleaseResetReportEvidence {
	if (evidence.type === "error") return { ...evidence, error: { ...evidence.error } };
	return { ...evidence };
}

function copyAction(action: ReleaseResetAction): ReleaseResetAction {
	return action.type === "restore-tracked-paths"
		? { type: action.type, paths: [...action.paths] }
		: { ...action };
}

function refuse(
	code: ReleaseResetRefusalCode,
	guidance: string,
	evidence: ReleaseResetEvidence | null,
	failure?: ReleaseResetFailure,
): Extract<ReleaseResetResult, { readonly outcome: "refused" }> {
	return {
		outcome: "refused",
		code,
		guidance,
		evidence:
			evidence === null
				? null
				: buildEvidenceFromEvidence(evidence, evidence.plannedActions, evidence.completedActions),
		...(failure === undefined ? {} : { failure: { ...failure } }),
	};
}

function fingerprint(plan: Omit<ReleaseResetPlan, "fingerprint">): string {
	return hashJson(plan);
}

function inspectionFingerprint(inspection: ReleaseResetInspection): string {
	return hashJson({
		...inspection,
		manifests: [...inspection.manifests]
			.map((manifest) => ({
				...manifest,
				changedFields: [...manifest.changedFields].sort(),
			}))
			.sort((left, right) => left.path.localeCompare(right.path)),
		trackedChanges: [...inspection.trackedChanges].sort((left, right) =>
			left.path.localeCompare(right.path),
		),
		untrackedPaths: [...inspection.untrackedPaths].sort(),
	});
}

function hashJson(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort();
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
