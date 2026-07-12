import { landingExecutionFailure } from "../results.ts";
import type {
	LandContext,
	LandingFailure,
	LandingShape,
	PullRequestFacts,
	StackSnapshot,
} from "../types.ts";
import type { LandConfirmationGateway, LandExecutionProgress } from "./host-seams.ts";
import {
	resolveManagedSlotPostLandingCleanupDecision,
	type PostLandingCleanupRequest,
	type PostLandingSlotCleanupDecision,
} from "./post-landing-cleanup.ts";

const SQUASH_MERGE_PROGRESS = "Running gh pr merge --squash with PR title/body as commit message…";

export interface IsolatedLandingHost {
	readonly confirmation: LandConfirmationGateway;
	readonly progress: LandExecutionProgress;
}

export interface ExecuteIsolatedLandingOptions {
	readonly context: LandContext;
	readonly host: IsolatedLandingHost;
	readonly target: LandingShape;
	readonly isDryRun: boolean;
	readonly cleanup: PostLandingCleanupRequest;
}

export type IsolatedLandingOutcome =
	| {
			readonly type: "completed";
			readonly result: "dry-run";
			readonly pullRequest: PullRequestFacts;
			readonly cleanupDecision: { readonly type: "not-needed" };
	  }
	| {
			readonly type: "completed";
			readonly result: "merged";
			readonly pullRequest: PullRequestFacts;
			readonly commandOutput: string;
			readonly cleanupDecision: PostLandingSlotCleanupDecision;
	  }
	| {
			readonly type: "failure";
			readonly stage: "load" | "base-check" | "cleanup-confirmation" | "merge" | "verification";
			readonly failure: LandingFailure;
			readonly cleanupDecision: PostLandingSlotCleanupDecision;
	  };

export function isIsolatedFastPath(stack: StackSnapshot): boolean {
	return (
		stack.actualCurrentBranch !== stack.trunk &&
		stack.landingBranches.length === 1 &&
		stack.landingBranches[0] === stack.actualCurrentBranch &&
		stack.descendantBranches.length === 0
	);
}

export async function executeIsolatedLanding(
	options: ExecuteIsolatedLandingOptions,
): Promise<IsolatedLandingOutcome> {
	const noCleanup: PostLandingSlotCleanupDecision = { type: "not-needed" };
	const prResult = await options.context.github.pullRequestFacts({
		repoRoot: options.target.repoRoot,
		branchOrNumber: options.target.stack.actualCurrentBranch,
	});
	if (prResult.type === "failure") {
		return {
			type: "failure",
			stage: "load",
			failure: prResult.failure,
			cleanupDecision: noCleanup,
		};
	}
	const pullRequest = prResult.value;

	if (pullRequest.baseRefName !== options.target.trunk) {
		return {
			type: "failure",
			stage: "base-check",
			failure: landingExecutionFailure(
				`Refusing to land PR #${pullRequest.number}: base branch is '${pullRequest.baseRefName}', not Graphite trunk '${options.target.trunk}'. Merge not attempted.`,
				{ outcome: "refusal" },
			),
			cleanupDecision: noCleanup,
		};
	}

	if (options.isDryRun) {
		return {
			type: "completed",
			result: "dry-run",
			pullRequest,
			cleanupDecision: noCleanup,
		};
	}

	const cleanupDecision = await resolveManagedSlotPostLandingCleanupDecision({
		confirmation: options.host.confirmation,
		cleanup: options.cleanup,
		shape: options.target,
	});
	if (cleanupDecision.type === "failure") {
		return {
			type: "failure",
			stage: "cleanup-confirmation",
			failure: cleanupDecision.failure,
			cleanupDecision: noCleanup,
		};
	}

	options.host.progress.setStatus(SQUASH_MERGE_PROGRESS);
	options.host.progress.note(SQUASH_MERGE_PROGRESS);
	const mergeResult = await options.context.github.squashMergePullRequest({
		repoRoot: options.target.repoRoot,
		pullRequest,
	});
	if (mergeResult.type === "failure") {
		return {
			type: "failure",
			stage: "merge",
			failure: mergeResult.failure,
			cleanupDecision: cleanupDecision.value,
		};
	}

	const verified = await options.context.github.pullRequestFacts({
		repoRoot: options.target.repoRoot,
		branchOrNumber: String(pullRequest.number),
	});
	if (verified.type === "failure") {
		return {
			type: "failure",
			stage: "verification",
			failure: landingExecutionFailure(
				`gh pr merge exited 0, but verification could not load PR #${pullRequest.number}; post-landing cleanup skipped.\n${verified.failure.message}`,
			),
			cleanupDecision: cleanupDecision.value,
		};
	}

	if (!isVerifiedMergedPullRequest(verified.value, options.target)) {
		return {
			type: "failure",
			stage: "verification",
			failure: landingExecutionFailure(
				"gh pr merge exited 0 but PR did not verify as MERGED; post-landing cleanup skipped.",
			),
			cleanupDecision: cleanupDecision.value,
		};
	}

	return {
		type: "completed",
		result: "merged",
		pullRequest,
		commandOutput: successfulCommandOutput(mergeResult.value),
		cleanupDecision: cleanupDecision.value,
	};
}

function isVerifiedMergedPullRequest(verified: PullRequestFacts, target: LandingShape): boolean {
	return (
		verified.state === "MERGED" &&
		Boolean(verified.mergedAt) &&
		verified.baseRefName === target.trunk &&
		verified.headRefName === target.stack.actualCurrentBranch
	);
}

function successfulCommandOutput(result: {
	readonly stdout: string;
	readonly stderr: string;
}): string {
	return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
}
