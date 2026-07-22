import { describe, expect, test } from "vitest";

import {
	executeSingleBranchLanding,
	isSingleBranchFastPath,
	type SingleBranchLandingOutcome,
} from "../../src/land/execution/single-branch-landing.ts";
import type {
	LandConfirmationGateway,
	LandExecutionMessageProgress,
} from "../../src/land/execution/host-seams.ts";
import {
	failureLevel,
	formatSingleBranchDryRunNotification,
	formatSingleBranchLandingSuccessNotification,
} from "../../src/land/land-presentation.ts";
import {
	createInMemoryLandContext,
	pullRequestFacts,
	stackSnapshot,
} from "../../src/land/testing.ts";
import type {
	LandingBoundaryFailure,
	LandingShape,
	PullRequestFacts,
} from "../../src/land/types.ts";

const ROOT = "/repo";
const MANAGED_ROOT = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-03";
const TRUNK = "main";
const FEATURE = "feature-a";
const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const approvedConfirmation: LandConfirmationGateway = {
	confirm: async () => ({ type: "approved", approvalSource: "prompted" }),
};
const nullProgress: LandExecutionMessageProgress = {
	note() {},
	setStatus() {},
};

describe("single-branch landing core", () => {
	test("selects only the single-current-branch shape", () => {
		expect(isSingleBranchFastPath(stackSnapshot({ current: FEATURE }))).toBe(true);
		expect(isSingleBranchFastPath(stackSnapshot({ current: TRUNK }))).toBe(false);
		expect(
			isSingleBranchFastPath(
				stackSnapshot({ current: FEATURE, descendantBranches: ["feature-child"] }),
			),
		).toBe(false);
	});

	test("dry run returns typed facts without confirmation or mutation", async () => {
		let confirmationCount = 0;
		const fakes = createInMemoryLandContext({ github: { pullRequests: [openPullRequest()] } });
		const outcome = await run(fakes.context, {
			isDryRun: true,
			confirmation: {
				confirm: async () => {
					confirmationCount += 1;
					return { type: "approved", approvalSource: "prompted" };
				},
			},
		});

		expect(outcome).toMatchObject({
			type: "completed",
			result: "dry-run",
			pullRequest: { number: 101 },
			cleanupDecision: { type: "not-needed" },
		});
		expect(confirmationCount).toBe(0);
		expect(fakes.github.squashMergePullRequestCalls).toEqual([]);
	});

	test("refuses main landing authority before cleanup or merge", async () => {
		const requests: Parameters<LandConfirmationGateway["confirm"]>[0][] = [];
		const refusal = {
			type: "execution" as const,
			level: "error" as const,
			message:
				"Refusing to land a single-branch PR without confirmation in non-interactive mode. Re-run with --yes.",
			outcome: "refusal" as const,
			refusalReason: "non-interactive" as const,
		};
		const fakes = createInMemoryLandContext({ github: { pullRequests: [openPullRequest()] } });
		const outcome = await run(fakes.context, {
			shape: singleBranchShape(MANAGED_ROOT),
			confirmation: {
				confirm: async (request) => {
					requests.push(request);
					return { type: "refused-with-fully-worded-failure", failure: refusal };
				},
			},
		});

		expect(requests).toEqual([
			{
				kind: "single-branch-main-landing",
				pullRequest: expect.objectContaining({ number: 101, headRefName: FEATURE }),
				trunk: TRUNK,
			},
		]);
		expect(outcome).toEqual({
			type: "failure",
			stage: "confirmation",
			failure: refusal,
			cleanupDecision: { type: "not-needed" },
		});
		expect(fakes.github.squashMergePullRequestCalls).toEqual([]);
	});

	test("merges, verifies auto-MERGED fake facts, and preserves command output", async () => {
		const fakes = createInMemoryLandContext({
			github: {
				pullRequests: [openPullRequest()],
				squashMergeResults: { "101": { stdout: "merged\n", stderr: "notice\n" } },
			},
		});

		const outcome = await run(fakes.context);

		expect(outcome).toEqual({
			type: "completed",
			result: "merged",
			pullRequest: openPullRequest(),
			commandOutput: "merged\nnotice",
			cleanupDecision: { type: "not-needed" },
		});
		expect(fakes.github.pullRequestFactsCalls).toEqual([
			{ repoRoot: ROOT, branchOrNumber: FEATURE },
			{ repoRoot: ROOT, branchOrNumber: "101" },
		]);
		expect(fakes.github.squashMergePullRequestCalls).toMatchObject([
			{ repoRoot: ROOT, pullRequest: { number: 101, headRefName: FEATURE } },
		]);
	});

	test("refuses cleanup confirmation at the exact pre-merge point", async () => {
		const refusal = {
			type: "execution" as const,
			level: "error" as const,
			message:
				"Refusing to land before merge: post-landing slot cleanup requires confirmation in non-interactive mode. No PRs were landed.",
			outcome: "refusal" as const,
			refusalReason: "non-interactive" as const,
		};
		const fakes = createInMemoryLandContext({ github: { pullRequests: [openPullRequest()] } });
		const outcome = await run(fakes.context, {
			shape: singleBranchShape(MANAGED_ROOT),
			confirmation: {
				confirm: async (request) =>
					request.kind === "single-branch-main-landing"
						? { type: "approved", approvalSource: "prompted" }
						: { type: "refused-with-fully-worded-failure", failure: refusal },
			},
		});

		expect(outcome).toEqual({
			type: "failure",
			stage: "cleanup-confirmation",
			failure: refusal,
			cleanupDecision: { type: "not-needed" },
		});
		expect(fakes.github.squashMergePullRequestCalls).toEqual([]);
	});

	test("preserves every merge boundary failure field", async () => {
		const mergeFailure: LandingBoundaryFailure = {
			type: "boundary",
			phase: "merge",
			source: "github",
			code: "squash_merge_failed",
			message: "Merge rejected.",
			displayCommand: "gh pr merge 101 --body '<PR body>'",
			execResult: {
				type: "exited",
				stdout: "",
				stderr: "merge rejected\n",
				code: 1,
				signal: null,
			},
			suggestedAction: "Inspect PR #101.",
		};
		const fakes = createInMemoryLandContext({
			github: {
				pullRequests: [openPullRequest()],
				squashMergeResults: { "101": { type: "failure", failure: mergeFailure } },
			},
		});

		const outcome = await run(fakes.context);

		expect(outcome).toEqual({
			type: "failure",
			stage: "merge",
			failure: mergeFailure,
			cleanupDecision: { type: "not-needed" },
		});
	});

	test("returns exact verification mismatch and load-failure outcomes", async () => {
		const loadFailure: LandingBoundaryFailure = {
			type: "boundary",
			phase: "merge",
			source: "github",
			code: "post_merge_load_failed",
			message: "GitHub unavailable.",
		};
		const mismatch = createInMemoryLandContext({
			github: {
				pullRequests: [openPullRequest()],
				postMergeFacts: { "101": openPullRequest() },
			},
		});
		const failedLoad = createInMemoryLandContext({
			github: {
				pullRequests: [openPullRequest()],
				postMergeFacts: { "101": { type: "failure", failure: loadFailure } },
			},
		});

		await expect(run(mismatch.context)).resolves.toEqual({
			type: "failure",
			stage: "verification",
			failure: {
				type: "execution",
				level: "error",
				message:
					"gh pr merge exited 0 but PR did not verify as MERGED; post-landing cleanup skipped.",
				outcome: "failure",
			},
			cleanupDecision: { type: "not-needed" },
		});
		await expect(run(failedLoad.context)).resolves.toEqual({
			type: "failure",
			stage: "verification",
			failure: {
				type: "execution",
				level: "error",
				message:
					"gh pr merge exited 0, but verification could not load PR #101; post-landing cleanup skipped.\nGitHub unavailable.",
				outcome: "failure",
			},
			cleanupDecision: { type: "not-needed" },
		});
	});

	test("keeps single-branch dry-run and success notification text byte-identical", () => {
		expect(formatSingleBranchDryRunNotification(101, TRUNK)).toBe(
			"Dry run only; would merge PR #101 into main.",
		);
		expect(
			formatSingleBranchLandingSuccessNotification({
				pullRequestNumber: 101,
				commandOutput: "merged\nnotice",
			}),
		).toBe("merged\nnotice\nMerged PR #101; squash commit used PR title/body.");
	});

	test("pins failureLevel and resulting CLI exit-code mapping", async () => {
		const fakes = createInMemoryLandContext({
			github: { pullRequests: [openPullRequest({ baseRefName: "release" })] },
		});
		const outcome = await run(fakes.context);
		expect(outcome.type).toBe("failure");
		if (outcome.type === "failure") {
			expect(outcome.failure).toMatchObject({ level: "error", outcome: "refusal" });
			expect(failureLevel(outcome.failure)).toBe("error");
			expect(failureLevel(outcome.failure) === "error" ? 1 : 0).toBe(1);
		}
	});
});

async function run(
	context: ReturnType<typeof createInMemoryLandContext>["context"],
	overrides: {
		readonly isDryRun?: boolean;
		readonly confirmation?: LandConfirmationGateway;
		readonly shape?: LandingShape;
	} = {},
): Promise<SingleBranchLandingOutcome> {
	return await executeSingleBranchLanding({
		context,
		host: { confirmation: overrides.confirmation ?? approvedConfirmation, progress: nullProgress },
		target: overrides.shape ?? singleBranchShape(),
		isDryRun: overrides.isDryRun ?? false,
		cleanup: {
			mode: (overrides.isDryRun ?? false) ? "dry-run" : "execute",
			policy: "free-slot",
		},
	});
}

function singleBranchShape(repoRoot = ROOT): LandingShape {
	return {
		repoRoot,
		current: FEATURE,
		trunk: TRUNK,
		metadataDbPath: `${repoRoot}/.git/.graphite_metadata.db`,
		stack: stackSnapshot({
			trunk: TRUNK,
			current: FEATURE,
			actualCurrentBranch: FEATURE,
			landingTargetBranch: FEATURE,
			landingBranches: [FEATURE],
		}),
	};
}

function openPullRequest(overrides: Partial<PullRequestFacts> = {}): PullRequestFacts {
	return pullRequestFacts({
		number: 101,
		headRefName: FEATURE,
		baseRefName: TRUNK,
		headRefOid: SHA,
		...overrides,
	});
}
