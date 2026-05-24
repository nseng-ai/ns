import { describe, expect, test } from "bun:test";

import landStackExtension, {
	LandStackError,
	formatCommand,
	formatFailure,
	formatPlan,
	isManagedSlotPath,
	outputTail,
	parseArgs,
	parseGtStackOutput,
	parseWorktreeList,
	shortSha,
	slotNameFromPath,
	isGtDeleteCheckedOutElsewhere,
	isGtDeleteMissingBranch,
	stripAnsi,
	validateInitialPrPreflight,
	validateOpenPrBasics,
	type BranchPlan,
	type ExecResult,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type LandedPr,
	type LandingPlan,
	type NotifyLevel,
	type PullRequestSnapshot,
} from "../src/land-stack.ts";

const PR_FIELDS = "number,title,body,state,isDraft,headRefName,baseRefName,headRefOid,mergeStateStatus,url,mergedAt";
const ROOT = "/repo";
const TRUNK = "main";
const CURRENT = "feature-b";
const DESCENDANT = "feature-c";
const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SHA_C = "cccccccccccccccccccccccccccccccccccccccc";

const STACK_WITH_DESCENDANT = ["◯ main", "◯ feature-a", "◉ feature-b", "◯ feature-c", ""].join("\n");
const STACK_TO_CURRENT = ["◯ main", "◯ feature-a", "◉ feature-b", ""].join("\n");
const STACK_SINGLE_BRANCH = ["◯ main", "◉ feature-a", ""].join("\n");

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type MessageRenderer = Parameters<NonNullable<ExtensionAPI["registerMessageRenderer"]>>[1];
type SentMessage = Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0] & {
	options?: Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[1];
};

type ExecCall = {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
};

type ScriptedExec = {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
};

type Notification = {
	message: string;
	level: NotifyLevel | undefined;
};

type Confirmation = {
	title: string;
	message: string;
};

type StatusUpdate = {
	key: string;
	value: string | undefined;
};

type WidgetUpdate = {
	key: string;
	value: string[] | undefined;
	options: { placement?: "aboveEditor" | "belowEditor" } | undefined;
};

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	readonly messageRenderers = new Map<string, MessageRenderer>();
	readonly messages: SentMessage[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[] = []) {
		this.script = [...script];
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	registerMessageRenderer(customType: string, renderer: MessageRenderer): void {
		this.messageRenderers.set(customType, renderer);
	}

	sendMessage(message: Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0], options?: SentMessage["options"]): void {
		this.messages.push({ ...message, options });
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (!expected) {
			const message = `unexpected exec: ${formatCommand(command, args)}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${formatCommand(expected.command, expected.args)}, got ${formatCommand(command, args)}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		return execResult(expected.result);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[], result?: Partial<ExecResult>): ScriptedExec {
	return { command, args, result };
}

function expectedSquashMergeArgs(options: { number: number; sha: string; title?: string | undefined; body?: string | null | undefined }): string[] {
	const title = options.title ?? `PR ${options.number}`;
	const body = options.body === undefined ? `Body for PR ${options.number}` : (options.body ?? "");
	return [
		"pr",
		"merge",
		String(options.number),
		"--squash",
		"--match-head-commit",
		options.sha,
		"--subject",
		title,
		"--body",
		body,
	];
}

function createContext(options: { cwd?: string; hasUI?: boolean; confirms?: boolean[] } = {}): {
	ctx: ExtensionCommandContext;
	notifications: Notification[];
	confirmations: Confirmation[];
	statuses: StatusUpdate[];
	widgets: WidgetUpdate[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const confirmations: Confirmation[] = [];
	const statuses: StatusUpdate[] = [];
	const widgets: WidgetUpdate[] = [];
	const confirmAnswers = [...(options.confirms ?? [true])];
	let waits = 0;

	const ctx: ExtensionCommandContext = {
		cwd: options.cwd ?? ROOT,
		hasUI: options.hasUI ?? true,
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async confirm(title: string, message: string): Promise<boolean> {
				confirmations.push({ title, message });
				return confirmAnswers.shift() ?? false;
			},
			setStatus(key: string, value: string | undefined): void {
				statuses.push({ key, value });
			},
			setWidget(key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void {
				widgets.push({ key, value, options });
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, confirmations, statuses, widgets, waitForIdleCalls: () => waits };
}

async function runLandStack(
	args: string,
	script: ScriptedExec[],
	contextOptions: { cwd?: string; hasUI?: boolean; confirms?: boolean[] } = {},
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	confirmations: Confirmation[];
	statuses: StatusUpdate[];
	widgets: WidgetUpdate[];
	waitForIdleCalls: () => number;
	messages: SentMessage[];
}> {
	const pi = new FakePi(script);
	landStackExtension(pi);
	const command = pi.commands.get("land-stack");
	expect(command).toBeDefined();
	const context = createContext(contextOptions);
	await command?.handler(args, context.ctx);
	return { pi, messages: pi.messages, ...context };
}

function commandMessagesText(messages: SentMessage[]): string {
	return messages.map((message) => messageContentText(message.content)).join("\n");
}

function messageContentText(content: SentMessage["content"]): string {
	if (typeof content === "string") return content;
	return content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
}

function prSnapshot(overrides: {
	number: number;
	branch: string;
	base: string;
	sha: string;
	title?: string | undefined;
	body?: string | null | undefined;
	state?: string;
	isDraft?: boolean;
	mergedAt?: string | null;
}): PullRequestSnapshot {
	return {
		number: overrides.number,
		title: overrides.title ?? `PR ${overrides.number}`,
		body: overrides.body === undefined ? `Body for PR ${overrides.number}` : overrides.body,
		state: overrides.state ?? "OPEN",
		isDraft: overrides.isDraft ?? false,
		headRefName: overrides.branch,
		baseRefName: overrides.base,
		headRefOid: overrides.sha,
		mergeStateStatus: "CLEAN",
		url: `https://github.example/pull/${overrides.number}`,
		mergedAt: overrides.mergedAt ?? null,
	};
}

function prStdout(pr: PullRequestSnapshot): string {
	return `${JSON.stringify(pr)}\n`;
}

function worktreeOutput(entries: Array<{ path: string; branch?: string }>): string {
	return entries
		.map((entry) => {
			const lines = [`worktree ${entry.path}`, "HEAD 0000000000000000000000000000000000000000"];
			if (entry.branch) {
				lines.push(`branch refs/heads/${entry.branch}`);
			}
			return lines.join("\n");
		})
		.join("\n\n");
}

function repoIntro(options: { current?: string | undefined; trunk?: string | undefined; stackOutput?: string | undefined } = {}): ScriptedExec[] {
	return [
		step("git", ["rev-parse", "--show-toplevel"], { stdout: `${ROOT}\n` }),
		step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${options.current ?? CURRENT}\n` }),
		step("gt", ["trunk", "--no-interactive"], { stdout: `${options.trunk ?? TRUNK}\n` }),
		step("gt", ["log", "short", "--stack", "-r", "--no-interactive"], {
			stdout: options.stackOutput ?? STACK_WITH_DESCENDANT,
		}),
	];
}

function cleanRepoChecks(): ScriptedExec[] {
	return [
		step("git", ["status", "--porcelain=v1"]),
		step("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { code: 1 }),
		step("git", ["rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD"], { code: 1 }),
		step("git", ["rev-parse", "-q", "--verify", "REVERT_HEAD"], { code: 1 }),
		step("git", ["rev-parse", "--git-path", "rebase-merge"], { stdout: ".git/rebase-merge\n" }),
		step("git", ["rev-parse", "--git-path", "rebase-apply"], { stdout: ".git/rebase-apply\n" }),
	];
}

function localBranchChecks(branches: string[]): ScriptedExec[] {
	return branches.map((branch) => step("git", ["show-ref", "--verify", `refs/heads/${branch}`]));
}

function initialBranchPlans(options: { featureBBase?: string | undefined } = {}): ScriptedExec[] {
	return [
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], { stdout: `${SHA_A}\n` }),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
			stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A })),
		}),
		step("git", ["rev-parse", "--verify", "refs/heads/feature-b^{commit}"], { stdout: `${SHA_B}\n` }),
		step("gh", ["pr", "view", "feature-b", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({ number: 102, branch: "feature-b", base: options.featureBBase ?? "feature-a", sha: SHA_B }),
			),
		}),
	];
}

function featureStackPreflight(options: { stackOutput?: string | undefined; worktrees?: string | undefined; featureBBase?: string | undefined } = {}): ScriptedExec[] {
	const stackOutput = options.stackOutput ?? STACK_WITH_DESCENDANT;
	const hasDescendants = stackOutput.includes(DESCENDANT);
	const worktrees = options.worktrees ?? worktreeOutput([{ path: ROOT, branch: CURRENT }]);
	return [
		...repoIntro({ stackOutput: options.stackOutput }),
		...cleanRepoChecks(),
		...localBranchChecks(["feature-a", "feature-b"]),
		...initialBranchPlans({ featureBBase: options.featureBBase }),
		step("git", ["worktree", "list", "--porcelain"], { stdout: worktrees }),
		...(hasDescendants ? [step("git", ["worktree", "list", "--porcelain"], { stdout: worktrees })] : []),
	];
}

function mergeFeatureA(
	options: {
		mergeCode?: number;
		verifyState?: string;
		includeCleanup?: boolean;
		refreshTarget?: string | null;
		title?: string;
		body?: string | null;
	} = {},
): ScriptedExec[] {
	const includeCleanup = options.includeCleanup ?? true;
	const steps = [
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], { stdout: `${SHA_A}\n` }),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A, title: options.title, body: options.body }),
			),
		}),
		step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_A, title: options.title, body: options.body }), {
			code: options.mergeCode ?? 0,
			stderr: options.mergeCode ? "merge blocked" : "",
		}),
	];
	if (options.mergeCode) {
		return steps;
	}
	steps.push(
		step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: 101,
					branch: "feature-a",
					base: TRUNK,
					sha: SHA_A,
					state: options.verifyState ?? "MERGED",
					mergedAt: options.verifyState === "OPEN" ? null : "2026-05-22T00:00:00Z",
				}),
			),
		}),
	);
	if (includeCleanup) {
		const refreshTarget = options.refreshTarget === undefined ? "feature-b" : options.refreshTarget;
		if (refreshTarget) {
			steps.push(step("gt", ["get", refreshTarget, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"]));
		}
		steps.push(
			step("gt", ["delete", "feature-a", "-f", "-q"]),
			step("gt", ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"]),
			step("gt", ["submit", "--branch", "feature-b", "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"]),
		);
	}
	return steps;
}

function mergeFeatureBThroughVerification(): ScriptedExec[] {
	return [
		step("git", ["rev-parse", "--verify", "refs/heads/feature-b^{commit}"], { stdout: `${SHA_B}\n` }),
		step("gh", ["pr", "view", "feature-b", "--json", PR_FIELDS], {
			stdout: prStdout(prSnapshot({ number: 102, branch: "feature-b", base: TRUNK, sha: SHA_B })),
		}),
		step("gh", expectedSquashMergeArgs({ number: 102, sha: SHA_B })),
		step("gh", ["pr", "view", "102", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: 102,
					branch: "feature-b",
					base: TRUNK,
					sha: SHA_B,
					state: "MERGED",
					mergedAt: "2026-05-22T00:00:00Z",
				}),
			),
		}),
	];
}

function mergeFeatureBWithDescendant(): ScriptedExec[] {
	return [
		...mergeFeatureBThroughVerification(),
		step("gt", ["get", DESCENDANT, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"]),
		step("gt", ["delete", "feature-b", "-f", "-q"]),
		step("gt", ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"]),
		step("gt", ["submit", "--branch", DESCENDANT, "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"]),
	];
}

function mergeFeatureBWithDescendantRestackFailure(): ScriptedExec[] {
	return [
		...mergeFeatureBThroughVerification(),
		step("gt", ["get", DESCENDANT, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"]),
		step("gt", ["delete", "feature-b", "-f", "-q"]),
		step("gt", ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"], {
			code: 1,
			stderr: "restack failed",
		}),
	];
}

function singleBranchPreflight(worktrees: string): ScriptedExec[] {
	return singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A, worktrees });
}

function singleBranchPreflightWithRefs(options: {
	localSha: string;
	prSha: string;
	worktrees?: string | undefined;
	stackOutput?: string | undefined;
}): ScriptedExec[] {
	return [
		...repoIntro({ current: "feature-a", stackOutput: options.stackOutput ?? STACK_SINGLE_BRANCH }),
		...cleanRepoChecks(),
		...localBranchChecks(["feature-a"]),
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], { stdout: `${options.localSha}\n` }),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
			stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: options.prSha })),
		}),
		step("git", ["worktree", "list", "--porcelain"], {
			stdout: options.worktrees ?? worktreeOutput([{ path: ROOT, branch: "feature-a" }]),
		}),
	];
}

function mergeFeatureAThroughDelete(options: { refreshTarget?: string | null; title?: string; body?: string | null } = {}): ScriptedExec[] {
	const steps = [
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], { stdout: `${SHA_A}\n` }),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A, title: options.title, body: options.body }),
			),
		}),
		step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_A, title: options.title, body: options.body })),
		step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: 101,
					branch: "feature-a",
					base: TRUNK,
					sha: SHA_A,
					state: "MERGED",
					mergedAt: "2026-05-22T00:00:00Z",
				}),
			),
		}),
	];
	const refreshTarget = options.refreshTarget === undefined ? "feature-b" : options.refreshTarget;
	if (refreshTarget) {
		steps.push(step("gt", ["get", refreshTarget, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"]));
	}
	steps.push(step("gt", ["delete", "feature-a", "-f", "-q"]));
	return steps;
}

function mergeSingleFeatureA(): ScriptedExec[] {
	return mergeFeatureAThroughDelete({ refreshTarget: null });
}

function badInitialPrPreflight(pr: PullRequestSnapshot): ScriptedExec[] {
	return [
		...repoIntro({ current: "feature-a", stackOutput: STACK_SINGLE_BRANCH }),
		...cleanRepoChecks(),
		...localBranchChecks(["feature-a"]),
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], { stdout: `${SHA_A}\n` }),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], { stdout: prStdout(pr) }),
	];
}

async function captureConsole<T>(run: () => Promise<T>): Promise<T> {
	const originalLog = console.log;
	const originalError = console.error;
	console.log = () => undefined;
	console.error = () => undefined;
	try {
		return await run();
	} finally {
		console.log = originalLog;
		console.error = originalError;
	}
}

describe("land-stack extension registration", () => {
	test("registers the land-stack command with completions and a callable handler", async () => {
		const pi = new FakePi();
		landStackExtension(pi);

		const command = pi.commands.get("land-stack");
		expect(command?.description).toContain("Graphite stack");
		expect(command?.getArgumentCompletions?.("--")).toEqual([
			{ value: "--yes", label: "--yes" },
			{ value: "--dry-run", label: "--dry-run" },
			{ value: "--help", label: "--help" },
		]);

		const context = createContext();
		await command?.handler("--help", context.ctx);

		expect(context.waitForIdleCalls()).toBe(1);
		expect(context.notifications).toHaveLength(1);
		expect(context.notifications[0]?.message).toContain("Usage:");
		expect(pi.execCalls).toEqual([]);
	});
});

describe("land-stack pure helpers", () => {
	test("parses supported command arguments", () => {
		expect(parseArgs("--yes --dry-run --help")).toEqual({ yes: true, dryRun: true, help: true });
		expect(parseArgs("-y -h")).toEqual({ yes: true, dryRun: false, help: true });
		expect(() => parseArgs("--wat")).toThrow(LandStackError);
	});

	test("parses the current Graphite column and warns about off-column branches", () => {
		const parsed = parseGtStackOutput(["◯ main", "  ◯ sibling", "◯ feature-a (ready)", "◉ feature-b", "◯ feature-c"].join("\n"));

		expect(parsed).toEqual({
			trunk: "main",
			current: "feature-b",
			ancestors: ["main", "feature-a"],
			descendants: ["feature-c"],
			warnings: ["1 branch(es) in gt log output sit outside the current branch's column and were not included in the stack walk"],
		});
	});

	test("returns undefined when Graphite output has no current marker", () => {
		expect(parseGtStackOutput("◯ main\n◯ feature-a\n")).toBeUndefined();
	});

	test("parses git worktree porcelain output", () => {
		expect(
			parseWorktreeList(
				[
					"worktree /repo",
					"HEAD 1111111111111111111111111111111111111111",
					"branch refs/heads/feature-a",
					"",
					"worktree /detached",
					"HEAD 2222222222222222222222222222222222222222",
					"detached",
				].join("\n"),
			),
		).toEqual([{ path: "/repo", branch: "feature-a" }, { path: "/detached" }]);
	});

	test("detects managed slot paths and extracts slot names", () => {
		const slotPath = "/Users/me/.slots/repos/asdl-tools/worktrees/slot-04";
		expect(isManagedSlotPath(slotPath)).toBe(true);
		expect(slotNameFromPath(slotPath)).toBe("slot-04");
		expect(isManagedSlotPath("/tmp/asdl-tools/worktrees/slot-04")).toBe(false);
		expect(slotNameFromPath("/tmp/asdl-tools/worktrees/slot-04")).toBe("slot-04");
	});

	test("formats command displays with shell quoting", () => {
		expect(formatCommand("gt", ["delete", "feature/foo", "-f"])).toBe("gt delete feature/foo -f");
		expect(formatCommand("gh", ["pr", "view", "branch name", "can't"])).toBe("gh pr view 'branch name' 'can'\\''t'");
	});

	test("strips ANSI and truncates output tails", () => {
		expect(stripAnsi("\u001b[31mred\u001b[0m")).toBe("red");
		expect(stripAnsi("\u001b]8;;https://github.example/pull/101\u0007#101\u001b]8;;\u0007")).toBe("#101");
		const lines = Array.from({ length: 45 }, (_, index) => `line ${index + 1}`).join("\n");
		const tail = outputTail(lines);
		expect(tail.startsWith("… 5 earlier line(s) omitted\nline 6")).toBe(true);
		expect(tail).toContain("line 45");
	});

	test("detects benign Graphite delete failures", () => {
		expect(isGtDeleteMissingBranch(execResult({ code: 1, stderr: "ERROR: Could not find branch feature-a.\n" }), "feature-a")).toBe(
			true,
		);
		expect(isGtDeleteMissingBranch(execResult({ code: 1, stderr: "ERROR: authentication failed\n" }), "feature-a")).toBe(false);
		expect(isGtDeleteCheckedOutElsewhere(execResult({ code: 1, stderr: "fatal: 'master' is already checked out at '/repo-main'\n" }))).toBe(
			true,
		);
		expect(isGtDeleteCheckedOutElsewhere(execResult({ code: 1, stderr: "ERROR: authentication failed\n" }))).toBe(false);
	});

	test("formats plans and failures", () => {
		const plan: LandingPlan = {
			repoRoot: ROOT,
			stack: {
				trunk: TRUNK,
				current: CURRENT,
				landingBranches: ["feature-a", CURRENT],
				descendantBranches: [DESCENDANT],
				warnings: ["off-column branch ignored"],
			},
			branchPlans: [
				{ branch: "feature-a", localSha: SHA_A, pr: prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A }) },
				{ branch: CURRENT, localSha: SHA_B, pr: prSnapshot({ number: 102, branch: CURRENT, base: "feature-a", sha: SHA_B }) },
			],
			prSubmitRequirements: [],
			submitRestackRequirements: [],
			managedSlotConflicts: [{ branch: "feature-a", path: "/Users/me/.slots/repos/repo/worktrees/slot-01", kind: "managed-slot" }],
			descendantMaintenance: { kind: "auto", branches: [DESCENDANT], targetBranch: DESCENDANT },
		};
		const formatted = formatPlan(plan);
		expect(formatted).toContain("Land Graphite stack path: main -> feature-a -> feature-b");
		expect(formatted).toContain("Will leave open and try to restack/update after target PRs land:");
		expect(formatted).toContain("slot-01 feature-a");
		expect(formatted).toContain(
			"gh pr merge <number> --squash --match-head-commit <headRefOid> --subject <PR title> --body <PR body>",
		);

		const landed: LandedPr[] = [{ branch: "feature-a", number: 101, title: "PR 101" }];
		const failure = formatFailure(
			new LandStackError("Restack failed.", { failedBranch: CURRENT, suggestedAction: "Run gt restack." }),
			landed,
		);
		expect(failure).toContain("Already landed:");
		expect(failure).toContain("Failed at: feature-b");
		expect(failure).toContain("Suggested next action: Run gt restack.");
	});

	test("validates PR preflight invariants", () => {
		const validBottom: BranchPlan = {
			branch: "feature-a",
			localSha: SHA_A,
			pr: prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A }),
		};
		expect(() => validateInitialPrPreflight([validBottom], TRUNK)).not.toThrow();
		expect(shortSha(SHA_A)).toBe("aaaaaaa");

		const wrongBase = {
			...validBottom,
			pr: prSnapshot({ number: 101, branch: "feature-a", base: "not-main", sha: SHA_A }),
		};
		expect(() => validateInitialPrPreflight([wrongBase], TRUNK)).toThrow("expected main");

		const draft = {
			...validBottom,
			pr: prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A, isDraft: true }),
		};
		expect(() => validateInitialPrPreflight([draft], TRUNK)).toThrow("draft");

		expect(() =>
			validateOpenPrBasics({
				branch: "feature-a",
				localSha: SHA_A,
				pr: prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A, state: "CLOSED" }),
			}),
		).toThrow("CLOSED");
		expect(() =>
			validateOpenPrBasics({
				branch: "feature-a",
				localSha: SHA_A,
				pr: prSnapshot({ number: 101, branch: "wrong-head", base: TRUNK, sha: SHA_A }),
			}),
		).toThrow("head branch is wrong-head");
		expect(() =>
			validateOpenPrBasics({
				branch: "feature-a",
				localSha: SHA_A,
				pr: prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_B }),
			}),
		).toThrow("head SHA does not match");
	});
});

describe("land-stack command scenarios", () => {
	test("--dry-run builds and presents the plan without mutating", async () => {
		const { pi, notifications, confirmations } = await runLandStack("--dry-run", featureStackPreflight({ stackOutput: STACK_TO_CURRENT }));

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(notifications).toHaveLength(1);
		expect(notifications[0]?.level).toBe("info");
		expect(notifications[0]?.message).toContain("Dry run only; no PRs or local refs were changed.");
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(false);
	});

	test("--dry-run treats descendant slot checkouts as skipped maintenance", async () => {
		const descendantSlotPath = "/Users/me/.slots/repos/repo/worktrees/slot-07";
		const { pi, notifications, confirmations } = await runLandStack(
			"--dry-run",
			featureStackPreflight({
				worktrees: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: descendantSlotPath, branch: DESCENDANT },
				]),
			}),
		);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(notifications[0]?.message).toContain(
			"Will leave open without automatic restack/update because these descendants are checked out elsewhere:",
		);
		expect(notifications[0]?.message).toContain("slot-07 feature-c");
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(false);
	});

	test("non-interactive mode without --yes refuses before mutation", async () => {
		const { pi } = await captureConsole(() =>
			runLandStack("", featureStackPreflight({ stackOutput: STACK_TO_CURRENT }), { hasUI: false }),
		);

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(false);
	});

	test("dirty repo refuses before mutation", async () => {
		const script = [...repoIntro({ stackOutput: STACK_TO_CURRENT }), step("git", ["status", "--porcelain=v1"], { stdout: " M file.ts\n" })];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("Working tree is dirty");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("in-progress merge refuses before mutation", async () => {
		const script = [
			...repoIntro({ stackOutput: STACK_TO_CURRENT }),
			step("git", ["status", "--porcelain=v1"]),
			step("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { stdout: SHA_A, code: 0 }),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("A merge is in progress");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("missing local branch refuses before mutation", async () => {
		const script = [
			...repoIntro({ stackOutput: STACK_TO_CURRENT }),
			...cleanRepoChecks(),
			step("git", ["show-ref", "--verify", "refs/heads/feature-a"], { code: 1, stderr: "missing" }),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("Local branch feature-a does not exist");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("manual worktree conflict refuses before mutation", async () => {
		const script = featureStackPreflight({
			stackOutput: STACK_TO_CURRENT,
			worktrees: worktreeOutput([
				{ path: ROOT, branch: CURRENT },
				{ path: "/tmp/manual", branch: "feature-a" },
			]),
		});
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("non-slot worktree");
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(false);
	});

	test("happy path merges bottom-to-current and restacks but does not merge descendants", async () => {
		const script = [...featureStackPreflight(), ...mergeFeatureA(), ...mergeFeatureBWithDescendant()];
		const { pi, notifications, confirmations, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(
			pi.execCalls
				.filter((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge")
				.map((call) => call.args[2]),
		).toEqual(["101", "102"]);
		expect(
			pi.execCalls.filter((call) => call.command === "gt" && call.args[0] === "restack").map((call) => call.args[2]),
		).toEqual(["feature-b", DESCENDANT]);
		expect(notifications.at(-1)?.level).toBe("success");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain("Landed 2 PRs: #101 feature-a, #102 feature-b.");
		expect(commandMessagesText(messages)).toContain("Left open/restacked: feature-c.");
	});

	test("descendant managed slot does not block landing and skips descendant maintenance", async () => {
		const descendantSlotPath = "/Users/me/.slots/repos/repo/worktrees/slot-07";
		const script = [
			...featureStackPreflight({
				worktrees: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: descendantSlotPath, branch: DESCENDANT },
				]),
			}),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
		];
		const { pi, notifications, confirmations, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(
			pi.execCalls
				.filter((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge")
				.map((call) => call.args[2]),
		).toEqual(["101", "102"]);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "get" && call.args[1] === DESCENDANT)).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete" && call.args[1] === "feature-b")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "restack" && call.args[2] === DESCENDANT)).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "submit" && call.args[2] === DESCENDANT)).toBe(false);
		expect(notifications.at(-1)?.level).toBe("warning");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Left open; restack/update skipped: feature-c.");
		expect(streamText).toContain("Final local Graphite cleanup for feature-b and descendant restack/update were skipped");
		expect(streamText).toContain("slot-07 feature-c");
	});

	test("descendant manual worktree does not block landing and skips descendant maintenance", async () => {
		const script = [
			...featureStackPreflight({
				worktrees: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: "/tmp/manual-descendant", branch: DESCENDANT },
				]),
			}),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
		];
		const { pi, notifications, confirmations, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(
			pi.execCalls
				.filter((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge")
				.map((call) => call.args[2]),
		).toEqual(["101", "102"]);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "restack" && call.args[2] === DESCENDANT)).toBe(false);
		expect(notifications.at(-1)?.level).toBe("warning");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Left open; restack/update skipped: feature-c.");
		expect(streamText).toContain("/tmp/manual-descendant");
	});

	test("landing-scope managed slot cleanup is targeted and leaves descendant slots alone", async () => {
		const landingSlotPath = "/Users/me/.slots/repos/repo/worktrees/slot-01";
		const descendantSlotPath = "/Users/me/.slots/repos/repo/worktrees/slot-07";
		const initialWorktrees = worktreeOutput([
			{ path: ROOT, branch: CURRENT },
			{ path: landingSlotPath, branch: "feature-a" },
			{ path: descendantSlotPath, branch: DESCENDANT },
		]);
		const script = [
			...featureStackPreflight({ worktrees: initialWorktrees }),
			step("slot", ["free", "--wt", "slot-01"]),
			...cleanRepoChecks(),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: descendantSlotPath, branch: DESCENDANT },
				]),
			}),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
		];
		const { pi, notifications, confirmations } = await runLandStack("--yes", script, { confirms: [true] });

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Free landing slots?");
		expect(confirmations[0]?.message).toContain("slot-01 feature-a");
		expect(confirmations[0]?.message).not.toContain("slot-07 feature-c");
		expect(pi.execCalls.some((call) => call.command === "slot" && sameArgs(call.args, ["free", "--wt", "slot-01"]))).toBe(true);
		expect(pi.execCalls.some((call) => call.command === "slot" && sameArgs(call.args, ["gt", "free-stack"]))).toBe(false);
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain("Landed 2 PRs: #101 feature-a, #102 feature-b.");
	});

	test("non-interactive descendant-only slot conflict proceeds with --yes", async () => {
		const descendantSlotPath = "/Users/me/.slots/repos/repo/worktrees/slot-07";
		const script = [
			...featureStackPreflight({
				worktrees: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: descendantSlotPath, branch: DESCENDANT },
				]),
			}),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
		];
		const { pi } = await captureConsole(() => runLandStack("--yes", script, { hasUI: false }));

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(
			pi.execCalls
				.filter((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge")
				.map((call) => call.args[2]),
		).toEqual(["101", "102"]);
	});

	test("optional descendant maintenance failure completes with a warning", async () => {
		const script = [...featureStackPreflight(), ...mergeFeatureA(), ...mergeFeatureBWithDescendantRestackFailure()];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("warning");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain("Landed 2 PRs: #101 feature-a, #102 feature-b.");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Completed with 1 warning:");
		expect(streamText).toContain("Restack failed after merging #102; descendant branch feature-c was left for manual restack/update.");
		expect(streamText).not.toContain("land-stack stopped");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "submit" && call.args[2] === DESCENDANT)).toBe(false);
	});

	test("streams command execution as normal scrollback messages", async () => {
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...mergeSingleFeatureA(),
		];
		const { pi, messages, notifications, widgets } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(widgets).toEqual([]);
		expect(messages.length).toBeGreaterThan(0);
		expect(messages.every((message) => message.customType === "land-stack-command-stream" && message.display)).toBe(true);
		const streamText = commandMessagesText(messages);
		expect(streamText).not.toContain("land-stack command stream");
		expect(streamText).toContain("✓ $ git rev-parse --show-toplevel");
		expect(streamText).toContain(
			`✓ $ gh pr merge 101 --squash --match-head-commit ${SHA_A} --subject 'PR 101' --body '<PR body>'`,
		);
		expect(streamText).toContain("✓ Landed 1 PR: #101 feature-a.");
		expect(streamText).toContain("Clean up any remaining local branches manually, for example by running `gt sync` or deleting branches directly.");
	});

	test("uses merge-loop PR title and body as squash subject/body without displaying the body", async () => {
		const body = "Line 1\n\nLine 2";
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...mergeFeatureAThroughDelete({ refreshTarget: null, title: "Custom squash subject", body }),
		];
		const { pi, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		const mergeCall = pi.execCalls.find((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge");
		expect(mergeCall?.args).toEqual(
			expectedSquashMergeArgs({ number: 101, sha: SHA_A, title: "Custom squash subject", body }),
		);
		expect(mergeCall?.args.at(-1)).toBe(body);

		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			`✓ $ gh pr merge 101 --squash --match-head-commit ${SHA_A} --subject 'Custom squash subject' --body '<PR body>'`,
		);
		expect(streamText).not.toContain("Line 1");
		expect(streamText).not.toContain("Line 2");
	});

	test("passes an empty squash body when the merge-loop PR body is null", async () => {
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...mergeFeatureAThroughDelete({ refreshTarget: null, body: null }),
		];
		const { pi } = await runLandStack("--yes", script);

		pi.assertDone();
		const mergeCall = pi.execCalls.find((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge");
		expect(mergeCall?.args).toEqual(expectedSquashMergeArgs({ number: 101, sha: SHA_A, body: null }));
		expect(mergeCall?.args.at(-1)).toBe("");
	});

	test("renders final landed PR numbers as terminal hyperlinks", async () => {
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...mergeSingleFeatureA(),
		];
		const { pi, messages, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(notifications.at(-1)?.message).toContain("\x1B]8;;https://github.example/pull/101\x07#101\x1B]8;;\x07 feature-a");
		const finalMessage = messages.at(-1);
		expect(messageContentText(finalMessage?.content ?? "")).toContain("✓ Landed 1 PR: #101 feature-a.");
		expect(finalMessage?.details).toEqual({ prLinks: [{ number: 101, url: "https://github.example/pull/101" }] });
		const renderer = pi.messageRenderers.get("land-stack-command-stream");
		expect(renderer).toBeDefined();
		const rendered = renderer?.(finalMessage!, { expanded: false }, { fg: (_color: string, text: string) => text })
			.render(200)
			.join("\n");
		expect(rendered).toContain("\x1B]8;;https://github.example/pull/101\x07#101\x1B]8;;\x07 feature-a");
	});

	test("treats missing local branch during Graphite delete as successful cleanup", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...mergeSteps.slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], { code: 1, stderr: "ERROR: Could not find branch feature-a.\n" }),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain("Landed 1 PR: #101 feature-a.");
		expect(commandMessagesText(messages)).toContain("✓ $ gt delete feature-a -f -q — branch feature-a already absent");
	});

	test("treats final local Graphite delete checkout conflict as successful landing", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...mergeSteps.slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: "fatal: 'master' is already checked out at '/repo-main'\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain("Landed 1 PR: #101 feature-a.");
		const streamText = commandMessagesText(messages);
		expect(streamText).not.toContain("✗ $ gt delete feature-a -f -q — exit 1");
		expect(streamText).not.toContain("fatal: 'master' is already checked out");
		expect(streamText).toContain("✓ $ gt delete feature-a -f -q — branch feature-a still checked out; clean up manually with gt sync or direct branch deletion");
		expect(streamText).toContain("✓ Landed 1 PR: #101 feature-a.");
		expect(streamText).not.toContain("Completed with 1 warning:");
		expect(streamText).not.toContain("All target PRs were merged, but deleting the local Graphite branch feature-a failed.");
		expect(streamText).not.toContain("land-stack stopped");
		expect(streamText).not.toContain("Failed at:");
	});

	test("treats unexpected final local Graphite delete failure as a post-landing warning", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...mergeSteps.slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: "ERROR: authentication failed\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("warning");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain("Landed 1 PR: #101 feature-a.");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("✗ $ gt delete feature-a -f -q — exit 1");
		expect(streamText).toContain("✓ Landed 1 PR: #101 feature-a.");
		expect(streamText).toContain("Completed with 1 warning:");
		expect(streamText).toContain("All target PRs were merged, but deleting the local Graphite branch feature-a failed.");
		expect(streamText).not.toContain("land-stack stopped");
		expect(streamText).not.toContain("Failed at:");
	});

	test("targets the next open branch for Graphite refresh after merging a downstack PR", async () => {
		const script = [
			...featureStackPreflight({ stackOutput: STACK_TO_CURRENT }),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], { stdout: `${SHA_A}\n` }),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_A })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_A,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			step("gt", ["get", "feature-b", "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"]),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
			step("gt", ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"]),
			step("gt", ["submit", "--branch", "feature-b", "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"]),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-b^{commit}"], { stdout: `${SHA_B}\n` }),
			step("gh", ["pr", "view", "feature-b", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 102, branch: "feature-b", base: TRUNK, sha: SHA_B })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 102, sha: SHA_B })),
			step("gh", ["pr", "view", "102", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 102,
						branch: "feature-b",
						base: TRUNK,
						sha: SHA_B,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			step("gt", ["delete", "feature-b", "-f", "-q"]),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(pi.execCalls.filter((call) => call.command === "gt" && call.args[0] === "get").map((call) => call.args[1])).toEqual([
			"feature-b",
		]);
		expect(notifications.at(-1)?.level).toBe("success");
	});

	test("offers to submit stale PR heads during preflight before merging", async () => {
		const submitArgs = ["submit", "--branch", "feature-a", "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A }),
			step("git", ["rev-list", "-1", "refs/heads/main", "--not", "refs/heads/feature-a"]),
			step("gt", submitArgs),
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_B }),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], { stdout: `${SHA_B}\n` }),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_B })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_B })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_B,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		];
		const { pi, notifications, confirmations } = await runLandStack("--yes", script, { confirms: [true] });

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Run gt submit/update?");
		expect(confirmations[0]?.message).toContain("#101 feature-a");
		expect(confirmations[0]?.message).toContain("head aaaaaaa != local bbbbbbb");
		expect(pi.execCalls.findIndex((call) => call.command === "gt" && sameArgs(call.args, submitArgs))).toBeLessThan(
			pi.execCalls.findIndex((call) => call.command === "gh" && call.args[1] === "merge"),
		);
		expect(notifications.at(-1)?.level).toBe("success");
	});

	test("offers to restack before submit/update when git reachability shows restack is needed", async () => {
		const restackArgs = ["restack", "--branch", "feature-a", "--upstack", "--no-interactive"];
		const submitArgs = ["submit", "--branch", "feature-a", "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A }),
			step("git", ["rev-list", "-1", "refs/heads/main", "--not", "refs/heads/feature-a"], { stdout: `${SHA_C}\n` }),
			step("gt", restackArgs),
			step("gt", submitArgs),
			...singleBranchPreflightWithRefs({ localSha: SHA_C, prSha: SHA_C }),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], { stdout: `${SHA_C}\n` }),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_C })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_C })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_C,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		];
		const { pi, notifications, confirmations, messages } = await runLandStack("--yes", script, { confirms: [true] });

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Run gt restack + submit/update?");
		expect(confirmations[0]?.message).toContain("needs restack before submit/update");
		expect(confirmations[0]?.message).toContain("- feature-a on main");
		expect(confirmations[0]?.message).toContain("#101 feature-a");
		expect(confirmations[0]?.message).toContain(`$ ${formatCommand("gt", restackArgs)}`);
		expect(confirmations[0]?.message).toContain(`$ ${formatCommand("gt", submitArgs)}`);
		expect(pi.execCalls.findIndex((call) => call.command === "gt" && sameArgs(call.args, restackArgs))).toBeLessThan(
			pi.execCalls.findIndex((call) => call.command === "gt" && sameArgs(call.args, submitArgs)),
		);
		expect(pi.execCalls.findIndex((call) => call.command === "gt" && sameArgs(call.args, submitArgs))).toBeLessThan(
			pi.execCalls.findIndex((call) => call.command === "gh" && call.args[1] === "merge"),
		);
		expect(commandMessagesText(messages)).toContain(`✓ $ ${formatCommand("gt", restackArgs)}`);
		expect(notifications.at(-1)?.level).toBe("success");
	});

	test("merge failure stops immediately with no local cleanup", async () => {
		const body = "Line 1\n\nLine 2";
		const script = [...featureStackPreflight({ stackOutput: STACK_TO_CURRENT }), ...mergeFeatureA({ mergeCode: 1, body })];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("Merge rejected; stopping stack landing immediately.");
		expect(notifications[0]?.message).not.toContain("Line 1");
		expect(notifications[0]?.message).not.toContain("Line 2");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			`✗ $ gh pr merge 101 --squash --match-head-commit ${SHA_A} --subject 'PR 101' --body '<PR body>' — exit 1`,
		);
		expect(streamText).not.toContain("Line 1");
		expect(streamText).not.toContain("Line 2");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "get")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(false);
	});

	test("verification failure after gh pr merge skips local Graphite cleanup", async () => {
		const script = [
			...featureStackPreflight({ stackOutput: STACK_TO_CURRENT }),
			...mergeFeatureA({ verifyState: "OPEN", includeCleanup: false }),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("PR did not verify as MERGED; local Graphite cleanup skipped");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "get")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(false);
	});

	test("managed slot conflict asks for confirmation and frees targeted slots before merging", async () => {
		const managedWorktrees = worktreeOutput([
			{ path: ROOT, branch: "feature-a" },
			{ path: "/Users/me/.slots/repos/repo/worktrees/slot-01", branch: "feature-a" },
		]);
		const script = [
			...singleBranchPreflight(managedWorktrees),
			step("slot", ["free", "--wt", "slot-01"]),
			...cleanRepoChecks(),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: worktreeOutput([{ path: ROOT, branch: "feature-a" }]),
			}),
			...mergeSingleFeatureA(),
		];
		const { pi, notifications, confirmations } = await runLandStack("--yes", script, { confirms: [true] });

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Free landing slots?");
		expect(confirmations[0]?.message).toContain("slot-01 feature-a");
		expect(confirmations[0]?.message).toContain("Command: slot free --wt slot-01");
		expect(pi.execCalls.findIndex((call) => call.command === "slot")).toBeLessThan(
			pi.execCalls.findIndex((call) => call.command === "gh" && call.args[1] === "merge"),
		);
		expect(pi.execCalls.some((call) => call.command === "slot" && sameArgs(call.args, ["gt", "free-stack"]))).toBe(false);
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain("Landed 1 PR: #101 feature-a.");
	});

	test("managed slot conflict in non-interactive mode refuses and does not free slots", async () => {
		const managedWorktrees = worktreeOutput([
			{ path: ROOT, branch: "feature-a" },
			{ path: "/Users/me/.slots/repos/repo/worktrees/slot-01", branch: "feature-a" },
		]);
		const { pi } = await captureConsole(() =>
			runLandStack("--yes", singleBranchPreflight(managedWorktrees), { hasUI: false }),
		);

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(false);
	});

	test("restack failure after a successful merge reports already-landed PRs", async () => {
		const script = [
			...featureStackPreflight({ stackOutput: STACK_TO_CURRENT }),
			...mergeFeatureAThroughDelete(),
			step("gt", ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"], {
				code: 1,
				stderr: "restack failed",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("land-stack stopped at feature-b");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("#101 feature-a");
		expect(streamText).toContain("Restack failed after merging #101; stopping before merging feature-b.");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "submit")).toBe(false);
	});

	test("submit/update failure after a successful merge reports already-landed PRs", async () => {
		const script = [
			...featureStackPreflight({ stackOutput: STACK_TO_CURRENT }),
			...mergeFeatureAThroughDelete(),
			step("gt", ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"]),
			step("gt", ["submit", "--branch", "feature-b", "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"], {
				code: 1,
				stderr: "submit failed",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("land-stack stopped at feature-b");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("#101 feature-a");
		expect(streamText).toContain("Submit/update failed after merging #101; stopping before merging feature-b.");
	});

	test("PR preflight failures refuse before worktree checks or mutation", async () => {
		const script = badInitialPrPreflight(
			prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A, isDraft: true }),
		);
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("is a draft");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "worktree")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(false);
	});
});
