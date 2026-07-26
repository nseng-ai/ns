import { failure, negative, ok, usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import type { CommandRunner } from "@nseng-ai/foundation/exec";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { NsDevCliContext } from "./context.ts";
import type { ReleaseResetGateway } from "./release/contracts.ts";
import {
	applyReleaseReset,
	planReleaseReset,
	releaseResetResultSchema,
	type ReleaseResetAction,
	type ReleaseResetEvidence,
	type ReleaseResetPlan,
	type ReleaseResetReportEvidence,
	type ReleaseResetResult,
} from "./release/reset.ts";
import { createSystemReleaseResetGateway } from "./release/system.ts";

export const resetPublicPackageReleaseRequestSchema = z.object({
	version: z
		.string()
		.describe("Concrete npm version whose unpublished local release state to reset."),
	dryRun: z
		.boolean()
		.default(false)
		.describe("Inspect and report the exact reset without mutation."),
	yes: z.boolean().default(false).describe("Apply the exact reset without an interactive prompt."),
});

export async function runResetPublicPackageRelease(
	context: NsDevCliContext,
	request: z.output<typeof resetPublicPackageReleaseRequestSchema>,
): Promise<ClinkrExit<ReleaseResetResult, unknown, unknown, unknown>> {
	const gateway = context.releaseReset ?? createReleaseResetGateway(context);
	let planned: Awaited<ReturnType<typeof planReleaseReset>>;
	try {
		planned = await planReleaseReset(gateway, request.version);
	} catch (error: unknown) {
		return unexpectedFailure("plan", error);
	}

	if (planned.outcome === "refused") return exitForRefusal(planned, request.version);
	if (request.dryRun || planned.outcome === "already-clean") return ok(planned);

	if (!request.yes) {
		if (!context.interaction.isInteractive()) {
			return usageError(
				"Applying a release reset non-interactively requires --yes; use --dry-run to inspect the exact impact first.",
				{
					missingFlag: "--yes",
					howToSupply: "Pass --yes to apply, or --dry-run to inspect without mutation.",
				},
			);
		}
		context.status?.(renderResetPublicPackageRelease(planned));
		let confirmation: Awaited<ReturnType<typeof context.interaction.confirm>>;
		try {
			confirmation = await context.interaction.confirm({
				message: `Apply this exact public-package release reset for ${planned.version}?`,
				defaultAnswer: "no",
			});
		} catch (error: unknown) {
			return unexpectedFailure("confirm", error);
		}
		if (confirmation.type !== "confirmed") {
			const declined = declinedResult(planned);
			return negative(
				confirmation.type === "aborted"
					? "Release reset confirmation was aborted; no reset effects ran."
					: "Release reset was declined; no reset effects ran.",
				declined,
			);
		}
	}

	let applied: ReleaseResetResult;
	try {
		applied = await applyReleaseReset(gateway, planned);
	} catch (error: unknown) {
		return unexpectedFailure("apply", error);
	}
	if (applied.outcome === "reset") return ok(applied);
	if (applied.outcome === "refused") return exitForRefusal(applied, request.version);
	return failure(
		"release-reset-failed",
		`Release reset apply returned unexpected outcome ${applied.outcome}.`,
		applied,
	);
}

export { releaseResetResultSchema };

export function renderResetPublicPackageRelease(result: ReleaseResetResult): string {
	return renderResetPublicPackageReleaseWithVersion(result);
}

function renderResetPublicPackageReleaseWithVersion(
	result: ReleaseResetResult,
	requestedVersion?: string,
): string {
	const evidence = result.outcome === "refused" ? result.evidence : result;
	const lines = [
		"Public package release reset",
		`Version: ${evidence?.version ?? requestedVersion ?? "unavailable"}`,
		`Outcome: ${result.outcome}`,
	];
	if (evidence === null) {
		lines.push("State evidence: unavailable");
	} else {
		lines.push(
			`Source branch: ${evidence.currentSourceBranch}`,
			`HEAD: ${evidence.headCommit}`,
			`Report: ${renderReport(evidence.report)}`,
			`Release branch: ${evidence.releaseBranch}`,
			`Release branch exists: ${evidence.releaseBranchExists ? "yes" : "no"}`,
			`Inspection fingerprint: ${evidence.inspectionFingerprint}`,
			"Tracked changes:",
			...renderTrackedChanges(evidence),
			"Exact restore paths:",
			...renderList(evidence.trackedPathsToRestore),
			`Exact release directory: ${evidence.releaseDirectory ?? "none"}`,
			`Release directory fingerprint: ${evidence.releaseDirectoryFingerprint ?? "none"}`,
			"Planned actions:",
			...renderActions(evidence.plannedActions),
			"Completed actions:",
			...renderActions(evidence.completedActions),
		);
	}
	if (result.outcome === "refused") {
		lines.push(`Refusal: ${result.code}`, `Recovery guidance: ${result.guidance}`);
		if (result.failure !== undefined) {
			lines.push(
				`Failure: ${result.failure.code}: ${result.failure.message}`,
				...(result.failure.displayCommand === undefined
					? []
					: [`Failed command: ${result.failure.displayCommand}`]),
			);
		}
	}
	return `${lines.join("\n")}\n`;
}

function createReleaseResetGateway(
	context: Pick<NsDevCliContext, "env" | "runCommand">,
): ReleaseResetGateway {
	const runCommand: CommandRunner = async (command, args, options = {}) =>
		await context.runCommand(command, args, { ...options, env: context.env });
	return createSystemReleaseResetGateway({ runCommand });
}

function exitForRefusal(
	result: Extract<ReleaseResetResult, { readonly outcome: "refused" }>,
	requestedVersion: string,
): ClinkrExit<ReleaseResetResult, unknown, unknown, unknown> {
	const rendered = renderResetPublicPackageReleaseWithVersion(result, requestedVersion);
	if (result.failure !== undefined) {
		return failure(
			"release-reset-failed",
			`Release reset failed: ${result.failure.message}\n${rendered}`,
			result,
		);
	}
	return negative(`Release reset refused: ${result.code}.`, result);
}

function unexpectedFailure(
	operation: "plan" | "confirm" | "apply",
	error: unknown,
): ClinkrExit<ReleaseResetResult, unknown, unknown, unknown> {
	const message = formatErrorMessage(error);
	return failure("release-reset-failed", `Release reset ${operation} failed: ${message}`, {
		operation,
		failure: { code: "release-reset-unexpected", message },
	});
}

function declinedResult(plan: ReleaseResetPlan): ReleaseResetResult {
	return {
		outcome: "declined",
		...copyEvidence(plan),
	};
}

function copyEvidence(evidence: ReleaseResetEvidence): ReleaseResetEvidence {
	return {
		version: evidence.version,
		currentSourceBranch: evidence.currentSourceBranch,
		headCommit: evidence.headCommit,
		report:
			evidence.report.type === "error"
				? { ...evidence.report, error: { ...evidence.report.error } }
				: { ...evidence.report },
		releaseBranch: evidence.releaseBranch,
		releaseBranchExists: evidence.releaseBranchExists,
		inspectionFingerprint: evidence.inspectionFingerprint,
		trackedChanges: evidence.trackedChanges.map((change) => ({ ...change })),
		trackedPathsToRestore: [...evidence.trackedPathsToRestore],
		releaseDirectory: evidence.releaseDirectory,
		releaseDirectoryFingerprint: evidence.releaseDirectoryFingerprint,
		plannedActions: evidence.plannedActions.map(copyAction),
		completedActions: evidence.completedActions.map(copyAction),
	};
}

function copyAction(action: ReleaseResetAction): ReleaseResetAction {
	return action.type === "restore-tracked-paths"
		? { type: action.type, paths: [...action.paths] }
		: { ...action };
}

function renderReport(report: ReleaseResetReportEvidence): string {
	if (report.type === "missing") return "missing";
	if (report.type === "error") {
		return `${report.errorType}; ${report.error.code}: ${report.error.message}`;
	}
	return `found; stage=${report.stage}; branch=${report.branch}; commit=${report.commit}; stale=${report.isCommitStale ? "yes" : "no"}; ancestor-of-HEAD=${report.isCommitAncestorOfHead ? "yes" : "no"}`;
}

function renderTrackedChanges(evidence: ReleaseResetEvidence): string[] {
	if (evidence.trackedChanges.length === 0) return ["  (none)"];
	return evidence.trackedChanges.map(
		(change) =>
			`  - ${change.path} (index=${change.indexChanged ? "changed" : "clean"}, worktree=${change.worktreeChanged ? "changed" : "clean"}, unexpected=${change.isUnexpectedStatus === true ? "yes" : "no"})`,
	);
}

function renderList(values: readonly string[]): string[] {
	return values.length === 0 ? ["  (none)"] : values.map((value) => `  - ${value}`);
}

function renderActions(actions: readonly ReleaseResetAction[]): string[] {
	if (actions.length === 0) return ["  (none)"];
	return actions.flatMap((action) =>
		action.type === "restore-tracked-paths"
			? [`  - restore tracked paths:`, ...action.paths.map((path) => `      ${path}`)]
			: [`  - remove release directory: ${action.path}`],
	);
}
