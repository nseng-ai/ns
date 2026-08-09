import type { Caps } from "@nseng-ai/clinkr";
import { renderResultBlockFromMessage } from "@nseng-ai/foundation/cli-theme";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import {
	buildLandFailurePresentation,
	formatPlan,
	formatPostLandingCleanupSuccessNotice,
	formatPreservedSlotHint,
	formatSingleBranchDryRunNotification,
	formatSingleBranchLandingSuccessNotification,
	formatSuccessSummary,
} from "./land-presentation.ts";
import type { FlowLandWorkflowResult } from "./landing-dispatch.ts";
import type {
	LandedChunk,
	LandingExecutionReport,
	LandingFailure,
	PostLandingSlotCleanupReport,
} from "./types.ts";

export type LandCommandSuccess =
	| {
			readonly type: "dry-run";
			readonly target: "stack" | "single-branch";
			readonly repoRoot: string;
			readonly pullRequest?: {
				readonly number: number;
				readonly branch: string;
				readonly base: string;
			};
			readonly plan?: {
				readonly trunk: string;
				readonly landingTargetBranch: string;
				readonly branches: readonly {
					readonly branch: string;
					readonly pullRequestNumber: number;
				}[];
			};
	  }
	| {
			readonly type: "stack-completed" | "cleanup-only";
			readonly repoRoot: string;
			readonly landedChunks: readonly LandedChunk[];
			readonly warnings: readonly string[];
			readonly cleanup: PostLandingSlotCleanupReport;
	  }
	| {
			readonly type: "single-branch-landed";
			readonly repoRoot: string;
			readonly pullRequest: {
				readonly number: number;
				readonly branch: string;
				readonly base: string;
			};
			readonly cleanup: PostLandingSlotCleanupReport;
	  };

export function landCommandSuccess(result: FlowLandWorkflowResult): LandCommandSuccess | undefined {
	if (result.type === "single-branch-dry-run") {
		return {
			type: "dry-run",
			target: "single-branch",
			repoRoot: result.repoRoot,
			pullRequest: {
				number: result.pullRequest.number,
				branch: result.pullRequest.headRefName,
				base: result.pullRequest.baseRefName,
			},
		};
	}
	if (result.type === "single-branch-landed") {
		return {
			type: "single-branch-landed",
			repoRoot: result.repoRoot,
			pullRequest: {
				number: result.pullRequest.number,
				branch: result.pullRequest.headRefName,
				base: result.pullRequest.baseRefName,
			},
			cleanup: result.cleanup,
		};
	}
	if (result.type !== "stack" || result.execution.type !== "completed") return undefined;
	const report = result.execution.report;
	if (report.completionDisposition.type === "nothing-to-land") return undefined;
	if (report.mode === "dry-run") {
		return {
			type: "dry-run",
			target: "stack",
			repoRoot: report.repoRoot,
			...(report.plan === undefined
				? {}
				: {
						plan: {
							trunk: report.plan.stack.trunk,
							landingTargetBranch: report.plan.stack.landingTargetBranch,
							branches: report.plan.branchPlans.map((entry) => ({
								branch: entry.branch,
								pullRequestNumber: entry.pr.number,
							})),
						},
					}),
		};
	}
	return {
		type: report.completionDisposition.type === "cleanup-only" ? "cleanup-only" : "stack-completed",
		repoRoot: report.repoRoot,
		landedChunks: report.landedChunks,
		warnings: report.warnings.map((warning) => warning.message),
		cleanup: report.cleanup.postLandingSlotCleanup,
	};
}

export function renderLandWorkflowResult(caps: Caps, result: FlowLandWorkflowResult): string {
	if (result.type === "failed") {
		return renderFailure(
			caps,
			result.failure,
			result.landedPullRequest === undefined
				? []
				: [
						{
							branch: result.landedPullRequest.headRefName,
							number: result.landedPullRequest.number,
							title: result.landedPullRequest.title,
							...optionalEntry("url", result.landedPullRequest.url),
						},
					],
		);
	}
	if (result.type === "single-branch-dry-run") {
		return renderSuccess(
			caps,
			formatSingleBranchDryRunNotification(
				result.pullRequest.number,
				result.pullRequest.baseRefName,
			),
		);
	}
	if (result.type === "single-branch-landed") {
		const merge = formatSingleBranchLandingSuccessNotification({
			pullRequestNumber: result.pullRequest.number,
			commandOutput: result.commandOutput,
		});
		return renderSuccess(caps, [merge, cleanupText(result.cleanup)].filter(Boolean).join("\n\n"));
	}
	const execution = result.execution;
	if (execution.type === "failed") {
		return renderFailure(
			caps,
			execution.failure,
			execution.report.landedChunks.flatMap((chunk) => [...chunk.landed]),
		);
	}
	return renderStackCompletion(caps, execution.report);
}

function renderStackCompletion(caps: Caps, report: LandingExecutionReport): string {
	if (report.completionDisposition.type === "nothing-to-land") {
		return renderResultBlockFromMessage(caps, {
			kind: "refusal",
			message: `Current branch is ${report.completionDisposition.currentBranch}, which is trunk or has no PR path to land. Nothing to do.`,
		});
	}
	if (report.mode === "dry-run") {
		return renderSuccess(
			caps,
			[
				"Dry run only; no PRs or local refs were changed.",
				report.plan === undefined ? "" : formatPlan(report.plan),
			]
				.filter(Boolean)
				.join("\n\n"),
		);
	}
	if (report.completionDisposition.type === "cleanup-only") {
		return renderSuccess(caps, cleanupText(report.cleanup.postLandingSlotCleanup));
	}
	const landed = report.landedChunks.flatMap((chunk) => [...chunk.landed]);
	const summary = formatSuccessSummary({
		landed,
		descendantMaintenance: report.plan?.descendantMaintenance ?? { type: "none", branches: [] },
		warnings: report.warnings,
		cleanup: {
			retainedLocalBranches: [...report.cleanup.mergeMaintenanceCleanup.retainedLocalBranches],
		},
	});
	return renderSuccess(
		caps,
		[summary, cleanupText(report.cleanup.postLandingSlotCleanup)].filter(Boolean).join("\n\n"),
	);
}

function cleanupText(cleanup: PostLandingSlotCleanupReport): string {
	if (cleanup.type === "completed") return formatPostLandingCleanupSuccessNotice(cleanup);
	if (cleanup.type === "preserved") return formatPreservedSlotHint(cleanup);
	return "";
}

function renderFailure(
	caps: Caps,
	failure: LandingFailure,
	landed: Parameters<typeof buildLandFailurePresentation>[1],
): string {
	const presentation = buildLandFailurePresentation(failure, landed);
	return renderResultBlockFromMessage(caps, {
		kind: presentation.kind,
		message: presentation.fullMessage,
	});
}

function renderSuccess(caps: Caps, message: string): string {
	return renderResultBlockFromMessage(caps, { kind: "success", message });
}
