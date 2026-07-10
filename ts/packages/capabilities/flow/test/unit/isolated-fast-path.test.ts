import { describe, expect, test } from "vitest";

import { runIsolatedFastPathLanding } from "../../src/land/isolated-fast-path.ts";
import type {
	LandGithubPrGateway,
	LandResult,
	PullRequestFacts,
	SquashMergePullRequestResult,
} from "../../src/land/types.ts";
import type {
	LandingShape,
	NotifyLevel,
	PrintAwareLandStackCommandContext,
} from "../../src/land/stack/types.ts";

const ROOT = "/repo";
const TRUNK = "main";
const FEATURE = "feature-a";
const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

interface Notification {
	readonly message: string;
	readonly level?: NotifyLevel;
}

class RecordingGithubGateway implements LandGithubPrGateway {
	readonly pullRequestFactsCalls: Array<{ repoRoot: string; branchOrNumber: string }> = [];
	readonly squashMergePullRequestCalls: Array<{ repoRoot: string; pullRequest: PullRequestFacts }> =
		[];
	private readonly initialPullRequest: PullRequestFacts;
	private readonly verifiedPullRequest: PullRequestFacts;
	private readonly mergeResult: LandResult<SquashMergePullRequestResult>;

	constructor(options: {
		readonly initialPullRequest: PullRequestFacts;
		readonly verifiedPullRequest: PullRequestFacts;
		readonly mergeResult?: LandResult<SquashMergePullRequestResult>;
	}) {
		this.initialPullRequest = copyPullRequestFacts(options.initialPullRequest);
		this.verifiedPullRequest = copyPullRequestFacts(options.verifiedPullRequest);
		this.mergeResult = copyMergeResult(
			options.mergeResult ?? { type: "success", value: { stdout: "", stderr: "" } },
		);
	}

	async pullRequestFacts(request: {
		readonly repoRoot: string;
		readonly branchOrNumber: string;
	}): Promise<LandResult<PullRequestFacts>> {
		this.pullRequestFactsCalls.push({
			repoRoot: request.repoRoot,
			branchOrNumber: request.branchOrNumber,
		});
		if (request.branchOrNumber === String(this.initialPullRequest.number)) {
			return { type: "success", value: copyPullRequestFacts(this.verifiedPullRequest) };
		}
		return { type: "success", value: copyPullRequestFacts(this.initialPullRequest) };
	}

	async squashMergePullRequest(request: {
		readonly repoRoot: string;
		readonly pullRequest: PullRequestFacts;
	}): Promise<LandResult<SquashMergePullRequestResult>> {
		this.squashMergePullRequestCalls.push({
			repoRoot: request.repoRoot,
			pullRequest: copyPullRequestFacts(request.pullRequest),
		});
		return copyMergeResult(this.mergeResult);
	}
}

describe("isolated fast-path landing", () => {
	test("verifies MERGED state after the gateway squash merge", async () => {
		const notifications: Notification[] = [];
		const github = new RecordingGithubGateway({
			initialPullRequest: pullRequestFacts({ state: "OPEN", mergedAt: null }),
			verifiedPullRequest: pullRequestFacts({ state: "MERGED", mergedAt: "2026-07-02T00:00:00Z" }),
		});

		const result = await runIsolatedFastPathLanding({
			github,
			ctx: createContext(notifications),
			target: isolatedShape(),
			isDryRun: false,
		});

		expect(result.outcome).toEqual({ type: "success", value: undefined });
		expect(github.pullRequestFactsCalls).toEqual([
			{ repoRoot: ROOT, branchOrNumber: FEATURE },
			{ repoRoot: ROOT, branchOrNumber: "101" },
		]);
		expect(github.squashMergePullRequestCalls).toMatchObject([
			{ repoRoot: ROOT, pullRequest: { number: 101, headRefName: FEATURE } },
		]);
		expect(notifications.at(-1)).toMatchObject({
			level: "info",
			message: "Merged PR #101; squash commit used PR title/body.",
		});
	});

	test("preserves boundary failure diagnostics from the gateway", async () => {
		const notifications: Notification[] = [];
		const github = new RecordingGithubGateway({
			initialPullRequest: pullRequestFacts({ state: "OPEN", mergedAt: null }),
			verifiedPullRequest: pullRequestFacts({ state: "OPEN", mergedAt: null }),
			mergeResult: {
				type: "failure",
				failure: {
					type: "boundary",
					phase: "merge",
					source: "github",
					code: "squash_merge_failed",
					message: "Merge rejected.",
					displayCommand: "gh pr merge 101 --body '<PR body>'",
					execResult: {
						stdout: "",
						stderr: "merge rejected\n",
						code: 1,
						type: "exited",
						signal: null,
					},
					suggestedAction: "Inspect PR #101.",
				},
			},
		});

		const result = await runIsolatedFastPathLanding({
			github,
			ctx: createContext(notifications),
			target: isolatedShape(),
			isDryRun: false,
		});

		expect(result.outcome).toEqual({
			type: "failure",
			failure: expect.objectContaining({
				type: "boundary",
				message: "Merge rejected.",
				displayCommand: "gh pr merge 101 --body '<PR body>'",
				execResult: {
					stdout: "",
					stderr: "merge rejected\n",
					code: 1,
					type: "exited",
					signal: null,
				},
				suggestedAction: "Inspect PR #101.",
			}),
		});
		expect(notifications.at(-1)).toMatchObject({
			level: "error",
			message: "land stopped: Merge rejected.",
		});
	});

	test("stops post-landing cleanup when merge verification does not report MERGED", async () => {
		const notifications: Notification[] = [];
		const github = new RecordingGithubGateway({
			initialPullRequest: pullRequestFacts({ state: "OPEN", mergedAt: null }),
			verifiedPullRequest: pullRequestFacts({ state: "OPEN", mergedAt: null }),
		});

		const result = await runIsolatedFastPathLanding({
			github,
			ctx: createContext(notifications),
			target: isolatedShape(),
			isDryRun: false,
		});

		expect(result.outcome.type).toBe("failure");
		expect(github.squashMergePullRequestCalls).toHaveLength(1);
		expect(github.pullRequestFactsCalls).toEqual([
			{ repoRoot: ROOT, branchOrNumber: FEATURE },
			{ repoRoot: ROOT, branchOrNumber: "101" },
		]);
		expect(notifications.at(-1)).toMatchObject({
			level: "error",
			message:
				"gh pr merge exited 0 but PR did not verify as MERGED; post-landing cleanup skipped.",
		});
	});
});

function createContext(notifications: Notification[]): PrintAwareLandStackCommandContext {
	return {
		cwd: ROOT,
		hasUI: true,
		ui: {
			notify(message, level): void {
				notifications.push({ message, ...(level === undefined ? {} : { level }) });
			},
			async confirm(): Promise<boolean> {
				return true;
			},
			setStatus(): void {},
		},
		async waitForIdle(): Promise<void> {},
	};
}

function isolatedShape(): LandingShape {
	return {
		repoRoot: ROOT,
		current: FEATURE,
		trunk: TRUNK,
		metadataDbPath: `${ROOT}/.git/.graphite_metadata.db`,
		stack: {
			trunk: TRUNK,
			current: FEATURE,
			actualCurrentBranch: FEATURE,
			landingTargetBranch: FEATURE,
			landingBranches: [FEATURE],
			remainingLandingBranches: [],
			descendantBranches: [],
			descendantRootBranches: [],
			warnings: [],
		},
	};
}

function pullRequestFacts(overrides: Partial<PullRequestFacts> = {}): PullRequestFacts {
	return {
		id: overrides.id ?? `PR_node_${overrides.number ?? 101}`,
		number: overrides.number ?? 101,
		title: overrides.title ?? "PR 101",
		body: overrides.body ?? "Body for PR 101",
		state: overrides.state ?? "OPEN",
		isDraft: overrides.isDraft ?? false,
		headRefName: overrides.headRefName ?? FEATURE,
		baseRefName: overrides.baseRefName ?? TRUNK,
		headRefOid: overrides.headRefOid ?? SHA,
		...(overrides.mergeStateStatus === undefined
			? {}
			: { mergeStateStatus: overrides.mergeStateStatus }),
		...(overrides.url === undefined ? {} : { url: overrides.url }),
		...(overrides.mergedAt === undefined ? {} : { mergedAt: overrides.mergedAt }),
	};
}

function copyPullRequestFacts(pr: PullRequestFacts): PullRequestFacts {
	return {
		id: pr.id,
		number: pr.number,
		title: pr.title,
		body: pr.body,
		state: pr.state,
		isDraft: pr.isDraft,
		headRefName: pr.headRefName,
		baseRefName: pr.baseRefName,
		headRefOid: pr.headRefOid,
		...(pr.mergeStateStatus === undefined ? {} : { mergeStateStatus: pr.mergeStateStatus }),
		...(pr.url === undefined ? {} : { url: pr.url }),
		...(pr.mergedAt === undefined ? {} : { mergedAt: pr.mergedAt }),
	};
}

function copyMergeResult(
	result: LandResult<SquashMergePullRequestResult>,
): LandResult<SquashMergePullRequestResult> {
	if (result.type === "failure") return { type: "failure", failure: result.failure };
	return { type: "success", value: { stdout: result.value.stdout, stderr: result.value.stderr } };
}
