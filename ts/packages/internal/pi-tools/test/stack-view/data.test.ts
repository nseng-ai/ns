/**
 * Data-assembly tests for `loadStackView` (the `/stack:view` orchestration layer).
 *
 * Seams (verified against source):
 * - `execApi` drives the LBYL `git branch --show-current` check, the stack
 *   gateway's `git rev-parse --git-common-dir` probe (default gateway only), the
 *   `git config --get remote.origin.url` identity lookup, the batched
 *   `gh api graphql` stack-PR query, and the per-branch
 *   `git diff --name-only -z … -- .ns/objectives` objective diffs.
 * - `stackGateway` is the injected test seam for the Graphite stack read: the
 *   default `RealGraphiteStackGateway` reads Graphite's sqlite metadata db via
 *   filesystem/sqlite access that does NOT route through `execApi`, so every
 *   post-`stack()` path is driven here through an in-memory
 *   `FakeGraphiteStackGateway` instead.
 *
 * Two exec fakes are used deliberately:
 * - `FakeExecApi` (strictly ordered `ScriptedQueue`) for scenarios that bail
 *   before the concurrent phase — the command sequence is deterministic there.
 * - `KeyedFakeExecApi` (unordered, consume-once, keyed by command+args) for
 *   scenarios that reach the concurrent PR query and per-branch objective diffs,
 *   whose interleaving is nondeterministic.
 */
import { describe, expect, test } from "vitest";

import { ScriptedQueue } from "@nseng-ai/foundation/test-kit";
import type { CommandExecApi, ExecResult } from "@nseng-ai/foundation/exec";
import type {
	ChildrenOfResult,
	GraphiteStackGateway,
	GtCommandFailure,
	ParentOfResult,
	StackGraphResult,
	StackInfo,
	StackResult,
	TrunkResult,
} from "@nseng-ai/capability-kit/graphite/stack";
import { loadStackView } from "../../src/stack-view/data.ts";
import { buildStackPrQuery } from "../../src/stack-view/graphql.ts";

const CWD = "/repo";

interface ExecCall {
	command: string;
	args: string[];
}

interface ScriptedExec {
	command: string;
	args: string[] | ((args: string[]) => boolean);
	description?: string;
	result: Partial<ExecResult>;
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function matchesArgs(
	expected: string[] | ((args: string[]) => boolean),
	actual: string[],
): boolean {
	if (Array.isArray(expected))
		return (
			expected.length === actual.length && expected.every((value, index) => value === actual[index])
		);
	return expected(actual);
}

function describeStep(step: ScriptedExec): string {
	const args = Array.isArray(step.args)
		? step.args.join(" ")
		: (step.description ?? "<custom args matcher>");
	return `${step.command} ${args}`;
}

/**
 * Ordered scripted `CommandExecApi` for strictly sequential scenarios (every
 * covered path bails before the concurrent identity/objective phase), so
 * `assertDone()` proves exactly the expected commands ran, in order.
 */
class FakeExecApi implements CommandExecApi {
	readonly calls: ExecCall[] = [];
	private readonly script: ScriptedQueue<ScriptedExec>;

	constructor(steps: ScriptedExec[]) {
		this.script = new ScriptedQueue(steps, (step) => step);
	}

	async exec(command: string, args: string[]): Promise<ExecResult> {
		this.calls.push({ command, args: [...args] });
		const missingStepMessage = `unexpected exec: ${command} ${args.join(" ")}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) return execResult({ code: 99, stderr: missingStepMessage });
		if (expected.command !== command || !matchesArgs(expected.args, args)) {
			const message = `expected ${describeStep(expected)}, got ${command} ${args.join(" ")}`;
			this.script.recordError(message);
			return execResult({ code: 99, stderr: message });
		}
		return execResult(expected.result);
	}

	assertDone(): void {
		this.script.assertDone();
	}
}

/**
 * Unordered, consume-once scripted `CommandExecApi` keyed by command+args, for
 * scenarios where the identity→PR chain runs concurrently with the per-branch
 * objective diffs and the interleaving is nondeterministic. Every scripted step
 * must still be consumed exactly once (`assertDone()`), and any unmatched exec
 * is recorded as an error.
 */
class KeyedFakeExecApi implements CommandExecApi {
	readonly calls: ExecCall[] = [];
	private readonly pending: ScriptedExec[];
	private readonly errors: string[] = [];

	constructor(steps: ScriptedExec[]) {
		this.pending = [...steps];
	}

	async exec(command: string, args: string[]): Promise<ExecResult> {
		this.calls.push({ command, args: [...args] });
		const index = this.pending.findIndex(
			(step) => step.command === command && matchesArgs(step.args, args),
		);
		const step = index >= 0 ? this.pending[index] : undefined;
		if (step === undefined) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		this.pending.splice(index, 1);
		return execResult(step.result);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.pending.map(describeStep)).toEqual([]);
	}
}

/**
 * In-memory `GraphiteStackGateway` returning a canned `stack()` result. The
 * other gateway methods are never exercised by `loadStackView`; per the
 * errors-as-values convention they return marker failures that would surface
 * loudly in any assertion if a test accidentally reached them.
 */
class FakeGraphiteStackGateway implements GraphiteStackGateway {
	readonly stackCalls: string[] = [];
	private readonly result: StackResult;

	constructor(result: StackResult) {
		this.result = result;
	}

	async stack(cwd: string): Promise<StackResult> {
		this.stackCalls.push(cwd);
		return this.result;
	}

	async parentOf(_cwd: string): Promise<ParentOfResult> {
		return { type: "failure", failure: unscripted("parentOf") };
	}

	async childrenOf(_cwd: string): Promise<ChildrenOfResult> {
		return { type: "failure", failure: unscripted("childrenOf") };
	}

	async trunk(_cwd: string): Promise<TrunkResult> {
		return { type: "failure", failure: unscripted("trunk") };
	}

	async stackGraph(_cwd: string): Promise<StackGraphResult> {
		return { type: "failure", failure: unscripted("stackGraph") };
	}
}

function unscripted(method: string): GtCommandFailure {
	return {
		message: `FakeGraphiteStackGateway.${method} is not scripted in this test`,
		returnCode: null,
	};
}

function makeStackInfo(options: {
	trunk: string;
	current: string;
	ancestors: readonly string[];
	descendants?: readonly string[];
}): StackInfo {
	return {
		trunk: options.trunk,
		current: options.current,
		ancestors: options.ancestors,
		descendants: options.descendants ?? [],
		ancestorTermination: { type: "completed" },
		descendantWalk: { forks: [], childrenCorruptions: [], termination: { type: "completed" } },
		trunkMarker: { type: "clean" },
	};
}

/**
 * Three-branch fixture in the gateway's documented ordering: `ancestors` are
 * trunk-first, `descendants` are nearest-child-first. Render order becomes
 * top-of-stack first: feature/top, feature/mid (current), feature/base.
 */
function threeBranchStack(): StackInfo {
	return makeStackInfo({
		trunk: "main",
		current: "feature/mid",
		ancestors: ["main", "feature/base"],
		descendants: ["feature/top"],
	});
}

const THREE_BRANCH_ROWS = ["feature/top", "feature/mid", "feature/base"];

function currentBranchStep(result: Partial<ExecResult>): ScriptedExec {
	return { command: "git", args: ["branch", "--show-current"], result };
}

function gitCommonDirStep(result: Partial<ExecResult>): ScriptedExec {
	return { command: "git", args: ["rev-parse", "--git-common-dir"], result };
}

function originUrlStep(result: Partial<ExecResult>): ScriptedExec {
	return { command: "git", args: ["config", "--get", "remote.origin.url"], result };
}

function originUrlOkStep(owner: string, repo: string): ScriptedExec {
	return originUrlStep({ stdout: `https://github.com/${owner}/${repo}.git\n` });
}

function stackPrQueryStep(
	branches: string[],
	owner: string,
	repo: string,
	result: Partial<ExecResult>,
): ScriptedExec {
	return {
		command: "gh",
		args: [
			"api",
			"graphql",
			"-f",
			`query=${buildStackPrQuery(branches)}`,
			"-f",
			`owner=${owner}`,
			"-f",
			`repo=${repo}`,
			...branches.flatMap((branch, index) => ["-f", `branch${index}=${branch}`]),
		],
		result,
	};
}

function objectiveDiffStep(
	branch: string,
	parentBranch: string,
	result: Partial<ExecResult>,
): ScriptedExec {
	return {
		command: "git",
		args: ["diff", "--name-only", "-z", `${parentBranch}...${branch}`, "--", ".ns/objectives"],
		result,
	};
}

interface PrNodeFixture {
	number: number;
	title: string;
	url: string;
	isDraft?: boolean;
	threads?: { isResolved: boolean }[];
	/** Raw review-thread nodes carrying detail (path/line/author); overrides `threads` when set. */
	reviewThreadNodes?: unknown[];
	/** Raw `statusCheckRollup.contexts` nodes to roll up into checks/checkEntries. */
	checkNodes?: unknown[];
}

/** A passing CheckRun node carrying a workflow name, in the fetched contexts.nodes shape. */
function passingCheckRunNode(name: string, workflowName: string): unknown {
	return {
		__typename: "CheckRun",
		name,
		status: "COMPLETED",
		conclusion: "SUCCESS",
		startedAt: null,
		completedAt: null,
		detailsUrl: null,
		checkSuite: {
			workflowRun: {
				databaseId: null,
				runNumber: null,
				runAttempt: null,
				createdAt: null,
				updatedAt: null,
				workflow: { name: workflowName },
			},
		},
	};
}

/** An unresolved review-thread node carrying detail, in the fetched reviewThreads.nodes shape. */
function unresolvedThreadNode(path: string, line: number, author: string): unknown {
	return {
		id: `rt-${author}`,
		isResolved: false,
		path,
		line,
		originalLine: null,
		comments: {
			totalCount: 1,
			nodes: [
				{
					id: `c-${author}`,
					body: "a comment",
					author: { login: author },
					createdAt: "2026-02-02T00:00:00Z",
				},
			],
		},
		lastComment: { nodes: [{ id: `c-${author}` }] },
	};
}

function prConnection(node?: PrNodeFixture): object {
	if (node === undefined) return { nodes: [] };
	const reviewThreadNodes = node.reviewThreadNodes ?? node.threads;
	return {
		nodes: [
			{
				number: node.number,
				title: node.title,
				url: node.url,
				isDraft: node.isDraft ?? false,
				...(reviewThreadNodes === undefined
					? {}
					: { reviewThreads: { totalCount: reviewThreadNodes.length, nodes: reviewThreadNodes } }),
				...(node.checkNodes === undefined
					? {}
					: {
							commits: {
								nodes: [
									{
										commit: {
											statusCheckRollup: {
												state: "PENDING",
												contexts: { totalCount: node.checkNodes.length, nodes: node.checkNodes },
											},
										},
									},
								],
							},
						}),
			},
		],
	};
}

function graphqlOkStdout(aliases: Record<string, object>): string {
	return JSON.stringify({ data: { repository: aliases } });
}

/** Happy `gh api graphql` step for the three-branch fixture: #103 draft on top, #102 ready in the middle, no PR at the base. */
function threeBranchPrQueryStep(): ScriptedExec {
	return stackPrQueryStep(THREE_BRANCH_ROWS, "acme", "repo-name", {
		stdout: graphqlOkStdout({
			b0: prConnection({
				number: 103,
				title: "Top PR",
				url: "https://github.com/acme/repo-name/pull/103",
				isDraft: true,
				reviewThreadNodes: [unresolvedThreadNode("src/top.ts", 5, "reviewer")],
				checkNodes: [passingCheckRunNode("build", "CI")],
			}),
			b1: prConnection({
				number: 102,
				title: "Mid PR",
				url: "https://github.com/acme/repo-name/pull/102",
				threads: [{ isResolved: true }],
			}),
			b2: prConnection(),
		}),
	});
}

const NO_CHECKS = { passing: 0, failing: 0, pending: 0, total: 0 };

describe("loadStackView not-on-stack outcomes", () => {
	test("detached HEAD returns a friendly not-on-stack reason", async () => {
		const execApi = new FakeExecApi([currentBranchStep({ stdout: "" })]);

		const result = await loadStackView({ execApi, cwd: CWD });

		expect(result).toEqual({
			type: "not-on-stack",
			reason: "HEAD is detached; check out a branch to view its stack.",
		});
		expect(execApi.calls).toEqual([{ command: "git", args: ["branch", "--show-current"] }]);
		execApi.assertDone();
	});

	test("untracked branch returns a not-on-stack reason with the gt track hint", async () => {
		const execApi = new FakeExecApi([currentBranchStep({ stdout: "feature/loose\n" })]);
		const stackGateway = new FakeGraphiteStackGateway({
			type: "untracked_branch",
			message: "current branch is not tracked by Graphite: feature/loose",
		});

		const result = await loadStackView({ execApi, cwd: CWD, stackGateway });

		expect(result).toEqual({
			type: "not-on-stack",
			reason:
				"Branch 'feature/loose' is not tracked by Graphite; run 'gt track' to add it to a stack.",
		});
		expect(stackGateway.stackCalls).toEqual([CWD]);
		execApi.assertDone();
	});

	test("sitting on the trunk returns a not-on-stack reason naming the trunk", async () => {
		const execApi = new FakeExecApi([currentBranchStep({ stdout: "main\n" })]);
		const stackGateway = new FakeGraphiteStackGateway({
			type: "stack",
			stack: makeStackInfo({ trunk: "main", current: "main", ancestors: [] }),
		});

		const result = await loadStackView({ execApi, cwd: CWD, stackGateway });

		expect(result).toEqual({
			type: "not-on-stack",
			reason: "You're on the trunk branch 'main'; check out a stacked branch to view its stack.",
		});
		execApi.assertDone();
	});
});

describe("loadStackView error outcomes", () => {
	test("current-branch resolution failure (nonzero exit) surfaces an actionable error", async () => {
		const execApi = new FakeExecApi([
			currentBranchStep({ code: 1, stderr: "fatal: not a git repository" }),
		]);

		const result = await loadStackView({ execApi, cwd: CWD });

		expect(result.type).toBe("error");
		if (result.type !== "error") return;
		expect(result.message).toContain("Could not resolve the current branch");
		// It bails at the LBYL branch check: no stack/common-dir probe happens.
		expect(execApi.calls).toEqual([{ command: "git", args: ["branch", "--show-current"] }]);
		execApi.assertDone();
	});

	test("current-branch resolution failure (killed process) surfaces an actionable error", async () => {
		const execApi = new FakeExecApi([currentBranchStep({ code: 0, killed: true })]);

		const result = await loadStackView({ execApi, cwd: CWD });

		expect(result.type).toBe("error");
		if (result.type !== "error") return;
		expect(result.message).toContain("Could not resolve the current branch");
		execApi.assertDone();
	});

	test("stack-gateway failure (git common dir unresolved) names the stack step", async () => {
		const execApi = new FakeExecApi([
			currentBranchStep({ stdout: "feature/top\n" }),
			gitCommonDirStep({ code: 128, stderr: "fatal: not a git repository" }),
		]);

		const result = await loadStackView({ execApi, cwd: CWD });

		expect(result.type).toBe("error");
		if (result.type !== "error") return;
		expect(result.message).toContain("Could not read the Graphite stack");
		expect(result.message).toContain("Failed to resolve git common dir");
		// LBYL branch check, then the stack gateway's common-dir probe; the failure
		// short-circuits before the concurrent identity/PR + objective-diff phase,
		// so no `gh` or `git diff` commands are issued.
		expect(execApi.calls).toEqual([
			{ command: "git", args: ["branch", "--show-current"] },
			{ command: "git", args: ["rev-parse", "--git-common-dir"] },
		]);
		execApi.assertDone();
	});

	test("a missing origin remote fails the whole load before any PR query runs", async () => {
		// Identity is resolved before the concurrent phase, so a missing `origin`
		// remote (git config exits 1) bails before the PR query or objective diffs.
		const execApi = new FakeExecApi([
			currentBranchStep({ stdout: "feature/a\n" }),
			originUrlStep({ code: 1 }),
		]);
		const stackGateway = new FakeGraphiteStackGateway({
			type: "stack",
			stack: makeStackInfo({ trunk: "main", current: "feature/a", ancestors: ["main"] }),
		});

		const result = await loadStackView({ execApi, cwd: CWD, stackGateway });

		expect(result).toEqual({
			type: "error",
			message:
				"Could not determine the GitHub repository from the origin remote: no 'origin' remote is configured.",
		});
		// Identity failed first, so no GraphQL query and no objective diffs ran.
		expect(execApi.calls.some((call) => call.args[1] === "graphql")).toBe(false);
		expect(execApi.calls.some((call) => call.args[0] === "diff")).toBe(false);
		execApi.assertDone();
	});

	test("stack-PR-query failure fails the whole load naming the query step", async () => {
		const execApi = new KeyedFakeExecApi([
			currentBranchStep({ stdout: "feature/a\n" }),
			originUrlOkStep("acme", "repo-name"),
			stackPrQueryStep(["feature/a"], "acme", "repo-name", {
				code: 1,
				stderr: "API rate limit exceeded",
			}),
			objectiveDiffStep("feature/a", "main", { stdout: "" }),
		]);
		const stackGateway = new FakeGraphiteStackGateway({
			type: "stack",
			stack: makeStackInfo({ trunk: "main", current: "feature/a", ancestors: ["main"] }),
		});

		const result = await loadStackView({ execApi, cwd: CWD, stackGateway });

		expect(result).toEqual({
			type: "error",
			message: "Could not query stack pull requests: API rate limit exceeded",
		});
		execApi.assertDone();
	});
});

describe("loadStackView happy path", () => {
	test("joins a three-branch stack into ordered rows with PRs, statuses, and objectives", async () => {
		const execApi = new KeyedFakeExecApi([
			currentBranchStep({ stdout: "feature/mid\n" }),
			originUrlOkStep("acme", "repo-name"),
			threeBranchPrQueryStep(),
			objectiveDiffStep("feature/top", "feature/mid", {
				stdout: ".ns/objectives/alpha/roadmap.md\0",
			}),
			// Deliberately unsorted diff output: slugs come back sorted and unique.
			objectiveDiffStep("feature/mid", "feature/base", {
				stdout: ".ns/objectives/beta/notes.md\0.ns/objectives/alpha/objective.md\0",
			}),
			objectiveDiffStep("feature/base", "main", {
				stdout: ".ns/objectives/gamma/objective.md\0",
			}),
		]);
		const stackGateway = new FakeGraphiteStackGateway({ type: "stack", stack: threeBranchStack() });

		const result = await loadStackView({ execApi, cwd: CWD, stackGateway });

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		const model = result.model;
		expect(model.trunk).toBe("main");
		expect(model.currentBranch).toBe("feature/mid");
		expect(model.owner).toBe("acme");
		expect(model.repo).toBe("repo-name");

		// Row order is top-of-stack first; the parent chain walks toward the trunk
		// and the last row's parent is the trunk itself. PR data joins positionally.
		expect(model.prs).toEqual([
			{
				branch: "feature/top",
				parentBranch: "feature/mid",
				number: 103,
				title: "Top PR",
				url: "https://github.com/acme/repo-name/pull/103",
				graphiteUrl: "https://app.graphite.com/github/pr/acme/repo-name/103",
				isDraft: true,
				body: "",
				threads: { resolved: 0, total: 1 },
				checks: { passing: 1, failing: 0, pending: 0, total: 1 },
				checkEntries: [
					{
						name: "build",
						workflowName: "CI",
						bucket: "passing",
						status: "COMPLETED",
						conclusion: "SUCCESS",
						detailsUrl: null,
						identity: "check-run:CI:build",
					},
				],
				unresolvedThreads: [
					{
						id: "rt-reviewer",
						path: "src/top.ts",
						line: 5,
						author: "reviewer",
						comments: [
							{
								id: "c-reviewer",
								author: "reviewer",
								body: "a comment",
								createdAt: "2026-02-02T00:00:00Z",
							},
						],
						lastCommentId: "c-reviewer",
						totalComments: 1,
					},
				],
				status: "draft",
				objectiveSlugs: ["alpha"],
			},
			{
				branch: "feature/mid",
				parentBranch: "feature/base",
				number: 102,
				title: "Mid PR",
				url: "https://github.com/acme/repo-name/pull/102",
				graphiteUrl: "https://app.graphite.com/github/pr/acme/repo-name/102",
				isDraft: false,
				body: "",
				threads: { resolved: 1, total: 1 },
				checks: NO_CHECKS,
				checkEntries: [],
				unresolvedThreads: [],
				status: "ready",
				objectiveSlugs: ["alpha", "beta"],
			},
			{
				// The no-PR branch degrades: null number, empty PR fields, `no-pr`
				// status — but it keeps its objective slugs on the row.
				branch: "feature/base",
				parentBranch: "main",
				number: null,
				title: "",
				url: "",
				graphiteUrl: "",
				isDraft: false,
				body: "",
				threads: { resolved: 0, total: 0 },
				checks: NO_CHECKS,
				checkEntries: [],
				unresolvedThreads: [],
				status: "no-pr",
				objectiveSlugs: ["gamma"],
			},
		]);

		// slug → PR numbers in row order; the no-PR row's `gamma` contributes no
		// number, so it is absent from the map entirely.
		expect(model.objectivesBySlug).toEqual(
			new Map([
				["alpha", [103, 102]],
				["beta", [102]],
			]),
		);
		expect(stackGateway.stackCalls).toEqual([CWD]);
		execApi.assertDone();
	});

	test("a single branch's objective-diff failure degrades that row to no slugs without failing the load", async () => {
		const execApi = new KeyedFakeExecApi([
			currentBranchStep({ stdout: "feature/mid\n" }),
			originUrlOkStep("acme", "repo-name"),
			threeBranchPrQueryStep(),
			objectiveDiffStep("feature/top", "feature/mid", {
				stdout: ".ns/objectives/alpha/roadmap.md\0",
			}),
			objectiveDiffStep("feature/mid", "feature/base", {
				code: 128,
				stderr: "fatal: bad revision 'feature/base...feature/mid'",
			}),
			objectiveDiffStep("feature/base", "main", {
				stdout: ".ns/objectives/gamma/objective.md\0",
			}),
		]);
		const stackGateway = new FakeGraphiteStackGateway({ type: "stack", stack: threeBranchStack() });

		const result = await loadStackView({ execApi, cwd: CWD, stackGateway });

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		const model = result.model;
		expect(model.prs.map((pr) => pr.objectiveSlugs)).toEqual([["alpha"], [], ["gamma"]]);
		// The failed row contributes nothing; other rows' attribution is intact.
		expect(model.objectivesBySlug).toEqual(new Map([["alpha", [103]]]));
		execApi.assertDone();
	});
});
