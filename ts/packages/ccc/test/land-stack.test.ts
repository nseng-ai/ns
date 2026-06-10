import { describe, expect, test } from "vitest";

import { formatCommand, type ExecResult } from "@asdl/core/exec";
import {
	isGtDeleteCheckedOutElsewhere,
	isGtDeleteMissingBranch,
	outputTail,
	parseGitCheckedOutElsewhere,
	shortSha,
	stripAnsi,
} from "../src/land-stack/command-exec.ts";
import { landStackFailure, type LandStackResult } from "../src/land-stack/errors.ts";
import { LandStackCommandStream, withCommandStreaming } from "../src/land-stack/command-stream.ts";
import { executeStackLanding, parseArgs, registerLandStackRenderer } from "../src/land-stack.ts";
import {
	derivePathToTrunk,
	deriveDescendantSubtree,
	detectForkViolations,
	type GraphiteTopology,
} from "../src/land-stack/graphite-topology.ts";
import { loadPr, validateInitialPrPreflight, validateOpenPrBasics } from "../src/land-stack/pr-facts.ts";
import { formatFailure, formatPlan, formatSuccessNotification } from "../src/land-stack/presentation.ts";
import { detectInProgressOperation } from "../src/land-stack/stack-facts.ts";
import type {
	BranchPlan,
	LandStackExtensionAPI,
	LandStackCommandContext,
	LandedPr,
	LandingPlan,
	LandingShape,
	NotifyLevel,
	PullRequestSnapshot,
} from "../src/land-stack/types.ts";
import { detectWorktreeConflicts, isManagedSlotPath, parseWorktreeList, slotNameFromPath } from "../src/land-stack/worktrees.ts";

const PR_FIELDS = "number,title,body,state,isDraft,headRefName,baseRefName,headRefOid,mergeStateStatus,url,mergedAt";
const ROOT = "/repo";
const TRUNK = "main";
const CURRENT = "feature-b";
const DESCENDANT = "feature-c";
const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SHA_C = "cccccccccccccccccccccccccccccccccccccccc";

const GIT_COMMON_DIR = `${ROOT}/.git`;
const DB_PATH = `${GIT_COMMON_DIR}/.graphite_metadata.db`;
const TOPOLOGY_QUERY = "SELECT branch_name, parent_branch_name, children, validation_result FROM branch_metadata";
const TOPOLOGY_ARGS = ["-readonly", "-json", DB_PATH, TOPOLOGY_QUERY];

function metadataDbJson(rows: Array<{ branch: string; parent?: string; children?: string[]; trunk?: boolean }>): string {
	return JSON.stringify(
		rows.map((row) => ({
			branch_name: row.branch,
			parent_branch_name: row.parent ?? null,
			children: row.children ? JSON.stringify(row.children) : null,
			validation_result: row.trunk ? "TRUNK" : "VALID",
		})),
	);
}

const DB_WITH_DESCENDANT = metadataDbJson([
	{ branch: TRUNK, children: ["feature-a"], trunk: true },
	{ branch: "feature-a", parent: TRUNK, children: ["feature-b"] },
	{ branch: "feature-b", parent: "feature-a", children: [DESCENDANT] },
	{ branch: DESCENDANT, parent: "feature-b", children: [] },
]);
const DB_TO_CURRENT = metadataDbJson([
	{ branch: TRUNK, children: ["feature-a"], trunk: true },
	{ branch: "feature-a", parent: TRUNK, children: ["feature-b"] },
	{ branch: "feature-b", parent: "feature-a", children: [] },
]);
const DB_SINGLE_BRANCH = metadataDbJson([
	{ branch: TRUNK, children: ["feature-a"], trunk: true },
	{ branch: "feature-a", parent: TRUNK, children: [] },
]);

const BRANCH_SHAS: Record<string, string> = { "feature-a": SHA_A, "feature-b": SHA_B, [DESCENDANT]: SHA_C };

type MessageRenderer = Parameters<NonNullable<LandStackExtensionAPI["registerMessageRenderer"]>>[1];
type SentMessage = Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[0] & {
	options?: Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[1];
};

interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
}

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

interface Confirmation {
	title: string;
	message: string;
}

interface StatusUpdate {
	key: string;
	value: string | undefined;
}

interface WidgetUpdate {
	key: string;
	value: string[] | undefined;
	options: { placement?: "aboveEditor" | "belowEditor" } | undefined;
}

class FakePi implements LandStackExtensionAPI {
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	readonly messageRenderers = new Map<string, MessageRenderer>();
	readonly messages: SentMessage[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[] = []) {
		this.script = [...script];
	}

	registerMessageRenderer(customType: string, renderer: MessageRenderer): void {
		this.messageRenderers.set(customType, renderer);
	}

	sendMessage(message: Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[0], options?: SentMessage["options"]): void {
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

function expectSuccess<T>(result: LandStackResult<T>): T {
	expect(result.type).toBe("success");
	if (result.type !== "success") {
		throw new Error(`Expected land-stack success, got failure: ${result.failure.message}`);
	}
	return result.value;
}

function expectFailure<T>(result: LandStackResult<T>) {
	expect(result.type).toBe("failure");
	if (result.type !== "failure") {
		throw new Error("Expected land-stack failure, got success.");
	}
	return result.failure;
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
	ctx: LandStackCommandContext;
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

	const ctx: LandStackCommandContext = {
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
	registerLandStackRenderer(pi);
	const context = createContext(contextOptions);
	const parsedArgs = expectSuccess(parseArgs(args));
	await executeStackLanding(pi, context.ctx, parsedArgs);
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

function repoIntro(options: { current?: string | undefined; trunk?: string | undefined; dbRows?: string | undefined } = {}): ScriptedExec[] {
	return [
		step("git", ["rev-parse", "--show-toplevel"], { stdout: `${ROOT}\n` }),
		step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${options.current ?? CURRENT}\n` }),
		step("gt", ["trunk", "--no-interactive"], { stdout: `${options.trunk ?? TRUNK}\n` }),
		step("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { stdout: `${GIT_COMMON_DIR}\n` }),
		step("sqlite3", TOPOLOGY_ARGS, { stdout: `${options.dbRows ?? DB_WITH_DESCENDANT}\n` }),
	];
}

function backupRefSteps(branches: string[], shas: Record<string, string> = BRANCH_SHAS): ScriptedExec[] {
	return branches.flatMap((branch) => {
		const sha = shas[branch] ?? SHA_A;
		return [
			step("git", ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], { stdout: `${sha}\n` }),
			step("git", ["update-ref", `refs/ccc/land-backup/${branch}`, sha]),
		];
	});
}

function guardShaStep(branch: string, sha: string): ScriptedExec {
	return step("git", ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], { stdout: `${sha}\n` });
}

function childrenQueryArgs(branch: string): string[] {
	return ["-readonly", "-json", DB_PATH, `SELECT children FROM branch_metadata WHERE branch_name = '${branch}' LIMIT 1`];
}

function childrenRecheckStep(branch: string, children: string[]): ScriptedExec {
	return step("sqlite3", childrenQueryArgs(branch), { stdout: `${JSON.stringify([{ children: JSON.stringify(children) }])}\n` });
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

function featureStackPreflight(options: { dbRows?: string | undefined; worktrees?: string | undefined; featureBBase?: string | undefined } = {}): ScriptedExec[] {
	const dbRows = options.dbRows ?? DB_WITH_DESCENDANT;
	const hasDescendants = dbRows.includes(DESCENDANT);
	const worktrees = options.worktrees ?? worktreeOutput([{ path: ROOT, branch: CURRENT }]);
	return [
		...repoIntro({ dbRows: options.dbRows }),
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
		postRestackRefresh?: string | null;
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
			steps.push(
				guardShaStep(refreshTarget, SHA_B),
				step("gt", ["get", refreshTarget, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"]),
			);
		}
		steps.push(
			childrenRecheckStep("feature-a", ["feature-b"]),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
			step("gt", ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"]),
		);
		// post-restack refresh of the next forced-refresh target (the auto-maintained
		// descendant); skipped-maintenance scenarios pass null because there is no
		// later gt get to guard.
		const postRestackRefresh = options.postRestackRefresh === undefined ? DESCENDANT : options.postRestackRefresh;
		if (postRestackRefresh) {
			steps.push(guardShaStep(postRestackRefresh, BRANCH_SHAS[postRestackRefresh] ?? SHA_C));
		}
		steps.push(
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
		guardShaStep(DESCENDANT, SHA_C),
		step("gt", ["get", DESCENDANT, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"]),
		childrenRecheckStep("feature-b", [DESCENDANT]),
		step("gt", ["delete", "feature-b", "-f", "-q"]),
		step("gt", ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"]),
		step("gt", ["submit", "--branch", DESCENDANT, "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"]),
	];
}

function mergeFeatureBWithDescendantRestackFailure(): ScriptedExec[] {
	return [
		...mergeFeatureBThroughVerification(),
		guardShaStep(DESCENDANT, SHA_C),
		step("gt", ["get", DESCENDANT, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"]),
		childrenRecheckStep("feature-b", [DESCENDANT]),
		step("gt", ["delete", "feature-b", "-f", "-q"]),
		step("gt", ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"], {
			code: 1,
			stderr: "restack failed",
		}),
	];
}

function singleBranchShape(): LandingShape {
	return {
		repoRoot: ROOT,
		current: "feature-a",
		trunk: TRUNK,
		metadataDbPath: DB_PATH,
		stack: {
			trunk: TRUNK,
			current: "feature-a",
			landingBranches: ["feature-a"],
			descendantBranches: [],
			warnings: [],
		},
	};
}

function singleBranchPreflight(worktrees: string): ScriptedExec[] {
	return singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A, worktrees });
}

function singleBranchPreflightWithRefs(options: {
	localSha: string;
	prSha: string;
	worktrees?: string | undefined;
	dbRows?: string | undefined;
}): ScriptedExec[] {
	return [
		...repoIntro({ current: "feature-a", dbRows: options.dbRows ?? DB_SINGLE_BRANCH }),
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
		steps.push(
			guardShaStep(refreshTarget, SHA_B),
			step("gt", ["get", refreshTarget, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"]),
		);
	}
	steps.push(childrenRecheckStep("feature-a", refreshTarget ? ["feature-b"] : []), step("gt", ["delete", "feature-a", "-f", "-q"]));
	return steps;
}

function mergeSingleFeatureA(): ScriptedExec[] {
	return mergeFeatureAThroughDelete({ refreshTarget: null });
}

function badInitialPrPreflight(pr: PullRequestSnapshot): ScriptedExec[] {
	return [
		...repoIntro({ current: "feature-a", dbRows: DB_SINGLE_BRANCH }),
		...cleanRepoChecks(),
		...localBranchChecks(["feature-a"]),
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], { stdout: `${SHA_A}\n` }),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], { stdout: prStdout(pr) }),
	];
}

function topologyOf(entries: Record<string, { parent?: string; children?: string[]; trunk?: boolean }>): GraphiteTopology {
	return new Map(
		Object.entries(entries).map(([branch, entry]) => [
			branch,
			{ parent: entry.parent, children: entry.children ?? [], isTrunkMarked: entry.trunk ?? false },
		]),
	);
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

describe("land-stack pure helpers", () => {
	test("parses supported command arguments", () => {
		expect(expectSuccess(parseArgs("--yes --dry-run --help"))).toEqual({ yes: true, dryRun: true, help: true });
		expect(expectSuccess(parseArgs("-y -h"))).toEqual({ yes: true, dryRun: false, help: true });
		expect(expectFailure(parseArgs("--wat")).message).toContain("Unknown /code:land argument: --wat");
	});

	test("derives the landing path from Graphite metadata", () => {
		const topology = topologyOf({
			main: { children: ["feature-a"], trunk: true },
			"feature-a": { parent: "main", children: ["feature-b"] },
			"feature-b": { parent: "feature-a", children: [] },
		});

		expect(expectSuccess(derivePathToTrunk({ topology, current: "feature-b", trunk: "main", dbPath: DB_PATH }))).toEqual(["feature-a", "feature-b"]);
		expect(expectSuccess(derivePathToTrunk({ topology, current: "main", trunk: "main", dbPath: DB_PATH }))).toEqual([]);
	});

	test("fails closed when the current branch is untracked or the parent chain is broken", () => {
		const topology = topologyOf({
			main: { trunk: true },
			orphan: { children: [] },
		});

		expect(expectFailure(derivePathToTrunk({ topology, current: "ghost", trunk: "main", dbPath: DB_PATH })).message).toContain(
			`Current branch ghost is not tracked in Graphite metadata (${DB_PATH})`,
		);
		expect(expectFailure(derivePathToTrunk({ topology, current: "orphan", trunk: "main", dbPath: DB_PATH })).message).toContain(
			"ends at orphan without reaching trunk main",
		);

		const cyclic = topologyOf({
			"feature-a": { parent: "feature-b", children: [] },
			"feature-b": { parent: "feature-a", children: [] },
		});
		expect(expectFailure(derivePathToTrunk({ topology: cyclic, current: "feature-a", trunk: "main", dbPath: DB_PATH })).message).toContain("cycle");
	});

	test("derives the full descendant subtree in pre-order, not just the first-child chain", () => {
		const topology = topologyOf({
			"feature-b": { children: ["feature-c"] },
			"feature-c": { parent: "feature-b", children: ["feature-d", "feature-e"] },
			"feature-d": { parent: "feature-c", children: [] },
			"feature-e": { parent: "feature-c", children: [] },
		});

		expect(expectSuccess(deriveDescendantSubtree(topology, "feature-b"))).toEqual(["feature-c", "feature-d", "feature-e"]);
		expect(expectSuccess(deriveDescendantSubtree(topology, "feature-d"))).toEqual([]);
	});

	test("detects forks on the landing path and at the current branch but exempts trunk", () => {
		const topology = topologyOf({
			main: { children: ["feature-a", "other"], trunk: true },
			"feature-a": { parent: "main", children: ["feature-b", "side"] },
			"feature-b": { parent: "feature-a", children: [] },
			side: { parent: "feature-a", children: ["side-2"] },
			"side-2": { parent: "side", children: [] },
		});

		// trunk is excluded from the landing path, so its many children do not violate
		expect(detectForkViolations(topology, ["feature-a", "feature-b"])).toEqual([
			{ forkPoint: "feature-a", expectedChild: "feature-b", siblings: [{ branch: "side", subtree: ["side", "side-2"] }] },
		]);

		const atCurrent = detectForkViolations(
			topologyOf({ "feature-b": { children: ["feature-c", "feature-d"] } }),
			["feature-b"],
		);
		expect(atCurrent).toEqual([
			{
				forkPoint: "feature-b",
				expectedChild: undefined,
				siblings: [
					{ branch: "feature-c", subtree: ["feature-c"] },
					{ branch: "feature-d", subtree: ["feature-d"] },
				],
			},
		]);

		expect(detectForkViolations(topology, [])).toEqual([]);
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

	test("detects active rebase state with an injected path-existence check", async () => {
		const pi = new FakePi([
			step("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { code: 1 }),
			step("git", ["rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD"], { code: 1 }),
			step("git", ["rev-parse", "-q", "--verify", "REVERT_HEAD"], { code: 1 }),
			step("git", ["rev-parse", "--git-path", "rebase-merge"], { stdout: ".git/rebase-merge\n" }),
		]);

		const operation = await detectInProgressOperation(pi, ROOT, {
			pathExists: (path) => path === `${ROOT}/.git/rebase-merge`,
		});

		pi.assertDone();
		expect(operation).toBe("A rebase");
	});

	test("ignores stale rebase pseudo-refs when active rebase directories are absent", async () => {
		const pi = new FakePi([
			step("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { code: 1 }),
			step("git", ["rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD"], { code: 1 }),
			step("git", ["rev-parse", "-q", "--verify", "REVERT_HEAD"], { code: 1 }),
			step("git", ["rev-parse", "--git-path", "rebase-merge"], { stdout: ".git/rebase-merge\n" }),
			step("git", ["rev-parse", "--git-path", "rebase-apply"], { stdout: ".git/rebase-apply\n" }),
		]);

		const operation = await detectInProgressOperation(pi, ROOT, {
			pathExists: () => false,
		});

		pi.assertDone();
		expect(operation).toBeUndefined();
	});

	test("detects worktree conflicts with injected path normalization", async () => {
		const slotPath = "/Users/me/.slots/repos/repo/worktrees/slot-01";
		const pi = new FakePi([
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: worktreeOutput([
					{ path: "/symlink/repo", branch: CURRENT },
					{ path: slotPath, branch: "feature-a" },
				]),
			}),
		]);

		const conflicts = expectSuccess(
			await detectWorktreeConflicts(pi, ROOT, CURRENT, ["feature-a", CURRENT], {
				normalizePath: (path) => (path === ROOT || path === "/symlink/repo" ? "/real/repo" : `/real${path}`),
			}),
		);

		pi.assertDone();
		expect(conflicts).toEqual([
			{ branch: CURRENT, path: "/symlink/repo", kind: "current" },
			{ branch: "feature-a", path: slotPath, kind: "managed-slot" },
		]);
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

	test("parses Git checked-out-elsewhere failures", () => {
		expect(
			parseGitCheckedOutElsewhere(
				execResult({ code: 1, stderr: "fatal: 'master' is already checked out at '/Users/schrockn/code/asdl-tools'\n" }),
			),
		).toEqual({ branch: "master", path: "/Users/schrockn/code/asdl-tools" });
		expect(parseGitCheckedOutElsewhere(execResult({ code: 1, stderr: "ERROR: authentication failed\n" }))).toBeUndefined();
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
			metadataDbPath: DB_PATH,
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
		const failure = formatFailure(landStackFailure("Restack failed.", { failedBranch: CURRENT, suggestedAction: "Run gt restack." }), landed);
		expect(failure).toContain("Already landed:");
		expect(failure).toContain("Failed at: feature-b");
		expect(failure).toContain("Suggested next action: Run gt restack.");
	});

	test("command streaming returns failed command data when pi.exec throws", async () => {
		class ThrowingPi extends FakePi {
			override async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult> {
				this.execCalls.push({ command, args: [...args], options });
				throw new Error("spawn failed");
			}
		}

		const pi = new ThrowingPi();
		const context = createContext();
		const commandStream = new LandStackCommandStream(pi, context.ctx);
		const streamed = withCommandStreaming(pi, commandStream);

		const result = await streamed.exec("git", ["status"], { cwd: ROOT });

		expect(result).toEqual(execResult({ code: 1, stderr: "spawn failed" }));
		expect(commandMessagesText(pi.messages)).toContain("✗ $ git status — exit 1");
		expect(commandMessagesText(pi.messages)).toContain("spawn failed");
	});

	test("formats success notifications with action-first warnings", () => {
		const details = { prLinks: [{ number: 101, url: "https://github.example/pull/101" }] };
		const successNotification = formatSuccessNotification("Landed 1 PR: #101 feature-a.\nRemote branches were not deleted.", { details });
		expect(successNotification).toContain("\x1B]8;;https://github.example/pull/101\x07#101\x1B]8;;\x07 feature-a");
		expect(stripAnsi(successNotification)).toBe("Landed 1 PR: #101 feature-a.");

		const linkedWarningAction = formatSuccessNotification("Landed 1 PR: #101 feature-a.", {
			details,
			warnings: [{ message: "Post-landing cleanup failed.", notificationAction: "Resolve PR #101 manually." }],
		});
		expect(linkedWarningAction).toContain("\x1B]8;;https://github.example/pull/101\x07#101\x1B]8;;\x07");
		expect(stripAnsi(linkedWarningAction)).toBe("Resolve PR #101 manually.");

		expect(
			formatSuccessNotification("Landed 1 PR: #101 feature-a.", {
				warnings: [{ message: "Post-landing cleanup failed.", suggestedAction: "Delete local branch feature-a manually." }],
			}),
		).toBe("Delete local branch feature-a manually.");
		expect(formatSuccessNotification("Landed 1 PR: #101 feature-a.", { warnings: [{ message: "Inspect the stack manually." }] })).toBe(
			"Inspect the stack manually.",
		);
		expect(
			stripAnsi(
				formatSuccessNotification("Landed 1 PR: #101 feature-a.", {
					details,
					warnings: [{ level: "info", message: "Deferred optional maintenance.", suggestedAction: "Restack later." }],
				}),
			),
		).toBe("Landed 1 PR: #101 feature-a.");
	});

	test("validates PR preflight invariants", () => {
		const validBottom: BranchPlan = {
			branch: "feature-a",
			localSha: SHA_A,
			pr: prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A }),
		};
		expect(validateInitialPrPreflight([validBottom], TRUNK).type).toBe("success");
		expect(shortSha(SHA_A)).toBe("aaaaaaa");

		const wrongBase = {
			...validBottom,
			pr: prSnapshot({ number: 101, branch: "feature-a", base: "not-main", sha: SHA_A }),
		};
		expect(expectFailure(validateInitialPrPreflight([wrongBase], TRUNK)).message).toContain("expected main");

		const draft = {
			...validBottom,
			pr: prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A, isDraft: true }),
		};
		expect(expectFailure(validateInitialPrPreflight([draft], TRUNK)).message).toContain("draft");

		expect(
			expectFailure(
				validateOpenPrBasics({
					branch: "feature-a",
					localSha: SHA_A,
					pr: prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A, state: "CLOSED" }),
				}),
			).message,
		).toContain("CLOSED");
		expect(
			expectFailure(
				validateOpenPrBasics({
					branch: "feature-a",
					localSha: SHA_A,
					pr: prSnapshot({ number: 101, branch: "wrong-head", base: TRUNK, sha: SHA_A }),
				}),
			).message,
		).toContain("head branch is wrong-head");
		expect(
			expectFailure(
				validateOpenPrBasics({
					branch: "feature-a",
					localSha: SHA_A,
					pr: prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_B }),
				}),
			).message,
		).toContain("head SHA does not match");
	});
});

describe("loadPr boundary parsing", () => {
	function prViewStep(result: Partial<ExecResult>): ScriptedExec {
		return step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], result);
	}

	test("returns a normalized snapshot for valid PR JSON", async () => {
		const pi = new FakePi([
			prViewStep({
				stdout: JSON.stringify({
					number: 101,
					title: "Ship it",
					body: null,
					state: "OPEN",
					isDraft: false,
					headRefName: "feature-a",
					baseRefName: TRUNK,
					headRefOid: SHA_A,
					mergeStateStatus: "CLEAN",
					url: "https://github.example/pull/101",
					mergedAt: null,
					unexpected: "ignored",
				}),
			}),
		]);

		const pr = expectSuccess(await loadPr(pi, ROOT, "feature-a"));

		pi.assertDone();
		expect(pr).toEqual({
			number: 101,
			title: "Ship it",
			body: null,
			state: "OPEN",
			isDraft: false,
			headRefName: "feature-a",
			baseRefName: TRUNK,
			headRefOid: SHA_A,
			mergeStateStatus: "CLEAN",
			url: "https://github.example/pull/101",
			mergedAt: null,
		});
	});

	test("drops malformed optional fields instead of trusting them", async () => {
		const pi = new FakePi([
			prViewStep({
				stdout: JSON.stringify({
					number: 101,
					title: "Ship it",
					body: "Body",
					state: "OPEN",
					isDraft: true,
					headRefName: "feature-a",
					baseRefName: TRUNK,
					headRefOid: SHA_A,
					mergeStateStatus: 5,
					url: { not: "a string" },
					mergedAt: 12345,
				}),
			}),
		]);

		const pr = expectSuccess(await loadPr(pi, ROOT, "feature-a"));

		pi.assertDone();
		expect(pr.isDraft).toBe(true);
		expect(pr.mergeStateStatus).toBeUndefined();
		expect(pr.url).toBeUndefined();
		expect(pr.mergedAt).toBeUndefined();
	});

	test("rejects a non-object top-level PR JSON", async () => {
		const pi = new FakePi([prViewStep({ stdout: "[]" })]);

		const failure = expectFailure(await loadPr(pi, ROOT, "feature-a"));

		pi.assertDone();
		expect(failure.message).toContain("did not return required PR fields");
	});

	test("rejects a non-boolean isDraft rather than coercing it", async () => {
		const pi = new FakePi([
			prViewStep({
				stdout: JSON.stringify({
					number: 101,
					title: "Ship it",
					body: "Body",
					state: "OPEN",
					isDraft: "false",
					headRefName: "feature-a",
					baseRefName: TRUNK,
					headRefOid: SHA_A,
				}),
			}),
		]);

		expect(expectFailure(await loadPr(pi, ROOT, "feature-a")).message).toContain("did not return required PR fields");
	});

	test("fails clearly on invalid PR JSON", async () => {
		const pi = new FakePi([prViewStep({ stdout: "not json" })]);

		expect(expectFailure(await loadPr(pi, ROOT, "feature-a")).message).toContain("Failed to parse gh pr view output for feature-a");
	});
});

describe("land-stack command scenarios", () => {
	test("--dry-run builds and presents the plan without mutating", async () => {
		const { pi, notifications, confirmations } = await runLandStack("--dry-run", featureStackPreflight({ dbRows: DB_TO_CURRENT }));

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
			runLandStack("", featureStackPreflight({ dbRows: DB_TO_CURRENT }), { hasUI: false }),
		);

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(false);
	});

	test("dirty repo refuses before mutation", async () => {
		const script = [...repoIntro({ dbRows: DB_TO_CURRENT }), step("git", ["status", "--porcelain=v1"], { stdout: " M file.ts\n" })];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("Working tree is dirty");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("in-progress merge refuses before mutation", async () => {
		const script = [
			...repoIntro({ dbRows: DB_TO_CURRENT }),
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
			...repoIntro({ dbRows: DB_TO_CURRENT }),
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
			dbRows: DB_TO_CURRENT,
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
		const script = [
			...featureStackPreflight(),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBWithDescendant(),
		];
		const { pi, notifications, confirmations, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(
			pi.execCalls
				.filter((call) => call.command === "git" && call.args[0] === "update-ref")
				.map((call) => call.args[1]),
		).toEqual(["refs/ccc/land-backup/feature-a", "refs/ccc/land-backup/feature-b", `refs/ccc/land-backup/${DESCENDANT}`]);
		expect(
			pi.execCalls
				.filter((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge")
				.map((call) => call.args[2]),
		).toEqual(["101", "102"]);
		expect(
			pi.execCalls.filter((call) => call.command === "gt" && call.args[0] === "restack").map((call) => call.args[2]),
		).toEqual(["feature-b", DESCENDANT]);
		const descendantRestackCallIndex = pi.execCalls.findIndex(
			(call) => call.command === "gt" && sameArgs(call.args, ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"]),
		);
		expect(descendantRestackCallIndex).toBeGreaterThanOrEqual(0);
		expect(
			pi.execCalls
				.slice(descendantRestackCallIndex + 1)
				.some((call) => call.command === "git" && sameArgs(call.args, ["rev-parse", "--verify", `refs/heads/${DESCENDANT}^{commit}`])),
		).toBe(false);
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
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA({ postRestackRefresh: null }),
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
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain("Free slot-07 for feature-c; then restack/update feature-c.");
		expect(notificationText).not.toContain("Landed 2 PRs");
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
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA({ postRestackRefresh: null }),
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
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain("Detach /tmp/manual-descendant for feature-c; then restack/update feature-c.");
		expect(notificationText).not.toContain("Landed 2 PRs");
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
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA({ postRestackRefresh: null }),
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
		expect(notifications.at(-1)?.level).toBe("warning");
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain("Free slot-07 for feature-c; then restack/update feature-c.");
		expect(notificationText).not.toContain("Landed 2 PRs");
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
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA({ postRestackRefresh: null }),
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

	test("optional descendant gt get checkout conflict completes successfully with deferred note", async () => {
		const getArgs = ["get", DESCENDANT, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"];
		const script = [
			...featureStackPreflight(),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
			guardShaStep(DESCENDANT, SHA_C),
			step("gt", getArgs, { code: 1, stderr: "fatal: 'main' is already checked out at '/repo-main'\n" }),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain("Landed 2 PRs: #101 feature-a, #102 feature-b.");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Left open; restack/update deferred: feature-c.");
		expect(streamText).toContain("→ Deferred optional descendant maintenance for feature-c because main is checked out at /repo-main.");
		expect(streamText).toContain("Notes:");
		expect(streamText).toContain(
			"Optional descendant restack/update was deferred because Graphite could not refresh descendant branch feature-c: main is checked out at /repo-main.",
		);
		expect(streamText).not.toContain(`✗ $ ${formatCommand("gt", getArgs)} — exit 1`);
		expect(streamText).not.toContain("Completed with 1 warning:");
		expect(streamText).not.toContain("fatal: 'main' is already checked out");
		expect(streamText).not.toContain("land stopped");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete" && call.args[1] === "feature-b")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "restack" && call.args[2] === DESCENDANT)).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "submit" && call.args[2] === DESCENDANT)).toBe(false);
	});

	test("required next-landing gt get checkout conflict stops before merging the next target PR", async () => {
		const getArgs = ["get", "feature-b", "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"];
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureA({ includeCleanup: false }),
			guardShaStep("feature-b", SHA_B),
			step("gt", getArgs, { code: 1, stderr: "fatal: 'main' is already checked out at '/repo-main'\n" }),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		expect(notifications.at(-1)?.message).toContain("land stopped at feature-b");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("#101 feature-a");
		expect(streamText).toContain("Graphite could not refresh next landing branch feature-b: main is checked out at /repo-main.");
		expect(streamText).toContain("Suggested next action: Switch/detach /repo-main from main");
		expect(streamText).toContain(formatCommand("gt", getArgs));
		expect(
			pi.execCalls
				.filter((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge")
				.map((call) => call.args[2]),
		).toEqual(["101"]);
	});

	test("optional descendant maintenance failure completes with a warning", async () => {
		const script = [
			...featureStackPreflight(),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBWithDescendantRestackFailure(),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("warning");
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain("Resolve restack failures for feature-c, then update that PR manually.");
		expect(notificationText).not.toContain("Landed 2 PRs");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Completed with 1 warning:");
		expect(streamText).toContain("Restack failed after merging #102; descendant branch feature-c was left for manual restack/update.");
		expect(streamText).not.toContain("land stopped");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "submit" && call.args[2] === DESCENDANT)).toBe(false);
	});

	test("streams command execution as normal scrollback messages", async () => {
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSingleFeatureA(),
		];
		const { pi, messages, notifications, widgets } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(widgets).toEqual([]);
		expect(messages.length).toBeGreaterThan(0);
		expect(messages.every((message) => message.customType === "land-command-stream" && message.display)).toBe(true);
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
			...backupRefSteps(["feature-a"]),
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
			...backupRefSteps(["feature-a"]),
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
			...backupRefSteps(["feature-a"]),
			...mergeSingleFeatureA(),
		];
		const { pi, messages, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(notifications.at(-1)?.message).toContain("\x1B]8;;https://github.example/pull/101\x07#101\x1B]8;;\x07 feature-a");
		const finalMessage = messages.at(-1);
		expect(messageContentText(finalMessage?.content ?? "")).toContain("✓ Landed 1 PR: #101 feature-a.");
		expect(finalMessage?.details).toEqual({ prLinks: [{ number: 101, url: "https://github.example/pull/101" }] });
		const renderer = pi.messageRenderers.get("land-command-stream");
		expect(renderer).toBeDefined();
		const rendered = renderer?.(finalMessage!, { expanded: false }, { fg: (_color: string, text: string) => text })
			.render(200)
			.join("\n");
		expect(rendered).toContain("\x1B]8;;https://github.example/pull/101\x07#101\x1B]8;;\x07 feature-a");
	});

	test("command stream renderer ignores unsafe PR link URLs in details", () => {
		const pi = new FakePi();
		registerLandStackRenderer(pi);
		const renderer = pi.messageRenderers.get("land-command-stream");
		expect(renderer).toBeDefined();

		const rendered = renderer?.(
			{
				customType: "land-command-stream",
				content: "✓ Landed 1 PR: #101 feature-a.",
				display: true,
				details: { prLinks: [{ number: 101, url: "javascript:alert(1)" }] },
			},
			{ expanded: false },
			{ fg: (_color: string, text: string) => text },
		)
			.render(200)
			.join("\n");

		expect(rendered).toBe("✓ Landed 1 PR: #101 feature-a.");
		expect(rendered).not.toContain("\x1B]8;;");
	});

	test("treats missing local branch during Graphite delete as successful cleanup", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
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
			...backupRefSteps(["feature-a"]),
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
		expect(streamText).not.toContain("land stopped");
		expect(streamText).not.toContain("Failed at:");
	});

	test("treats unexpected final local Graphite delete failure as a post-landing warning", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSteps.slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: "ERROR: authentication failed\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("warning");
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain("Delete or repair local Graphite branch feature-a manually, then inspect the stack.");
		expect(notificationText).not.toContain("Landed 1 PR");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("✗ $ gt delete feature-a -f -q — exit 1");
		expect(streamText).toContain("✓ Landed 1 PR: #101 feature-a.");
		expect(streamText).toContain("Completed with 1 warning:");
		expect(streamText).toContain("All target PRs were merged, but deleting the local Graphite branch feature-a failed.");
		expect(streamText).not.toContain("land stopped");
		expect(streamText).not.toContain("Failed at:");
	});

	test("targets the next open branch for Graphite refresh after merging a downstack PR", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
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
			guardShaStep("feature-b", SHA_B),
			step("gt", ["get", "feature-b", "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"]),
			childrenRecheckStep("feature-a", ["feature-b"]),
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
			childrenRecheckStep("feature-b", []),
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
			...backupRefSteps(["feature-a"], { "feature-a": SHA_B }),
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
			childrenRecheckStep("feature-a", []),
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

	test("reloads stack facts for the submit/update recheck after using an initial shape", async () => {
		const submitArgs = ["submit", "--branch", "feature-a", "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"];
		const script = [
			...cleanRepoChecks(),
			...localBranchChecks(["feature-a"]),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], { stdout: `${SHA_B}\n` }),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A })),
			}),
			step("git", ["worktree", "list", "--porcelain"], { stdout: worktreeOutput([{ path: ROOT, branch: "feature-a" }]) }),
			step("git", ["rev-list", "-1", "refs/heads/main", "--not", "refs/heads/feature-a"]),
			step("gt", submitArgs),
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_B }),
			...backupRefSteps(["feature-a"], { "feature-a": SHA_B }),
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
			childrenRecheckStep("feature-a", []),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		];
		const pi = new FakePi(script);
		const context = createContext({ confirms: [true] });

		await executeStackLanding(pi, context.ctx, expectSuccess(parseArgs("--yes")), { initialShape: singleBranchShape() });

		pi.assertDone();
		const submitIndex = pi.execCalls.findIndex((call) => call.command === "gt" && sameArgs(call.args, submitArgs));
		const recheckStackIndex = pi.execCalls.findIndex((call) => call.command === "sqlite3" && sameArgs(call.args, TOPOLOGY_ARGS));
		const mergeIndex = pi.execCalls.findIndex((call) => call.command === "gh" && call.args[1] === "merge");
		expect(submitIndex).toBeGreaterThanOrEqual(0);
		expect(recheckStackIndex).toBeGreaterThan(submitIndex);
		expect(recheckStackIndex).toBeLessThan(mergeIndex);
		expect(pi.execCalls.filter((call) => call.command === "sqlite3" && sameArgs(call.args, TOPOLOGY_ARGS))).toHaveLength(1);
		expect(context.notifications.at(-1)?.level).toBe("success");
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
			...backupRefSteps(["feature-a"], { "feature-a": SHA_C }),
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
			childrenRecheckStep("feature-a", []),
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
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureA({ mergeCode: 1, body }),
		];
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
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
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
			...backupRefSteps(["feature-a"]),
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
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureAThroughDelete(),
			step("gt", ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"], {
				code: 1,
				stderr: "restack failed",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("land stopped at feature-b");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("#101 feature-a");
		expect(streamText).toContain("Restack failed after merging #101; stopping before merging feature-b.");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "submit")).toBe(false);
	});

	test("submit/update failure after a successful merge reports already-landed PRs", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureAThroughDelete(),
			step("gt", ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"]),
			step("gt", ["submit", "--branch", "feature-b", "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"], {
				code: 1,
				stderr: "submit failed",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("land stopped at feature-b");
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

describe("fork-safe topology and destructive-phase guards", () => {
	const DB_FORKED_ANCESTOR = metadataDbJson([
		{ branch: TRUNK, children: ["feature-a"], trunk: true },
		{ branch: "feature-a", parent: TRUNK, children: ["feature-b", "side"] },
		{ branch: "feature-b", parent: "feature-a", children: [] },
		{ branch: "side", parent: "feature-a", children: ["side-2"] },
		{ branch: "side-2", parent: "side", children: [] },
	]);
	const DB_FORKED_CURRENT = metadataDbJson([
		{ branch: TRUNK, children: ["feature-a"], trunk: true },
		{ branch: "feature-a", parent: TRUNK, children: ["feature-b"] },
		{ branch: "feature-b", parent: "feature-a", children: [DESCENDANT, "feature-d"] },
		{ branch: DESCENDANT, parent: "feature-b", children: [] },
		{ branch: "feature-d", parent: "feature-b", children: [] },
	]);

	test("refuses to land through a fork at an ancestor landing branch", async () => {
		const { pi, notifications, messages } = await runLandStack("--yes", repoIntro({ dbRows: DB_FORKED_ANCESTOR }));

		pi.assertDone();
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("Refusing to land: the stack forks at feature-a.");
		expect(notifications[0]?.message).toContain("Landing path expects feature-a -> feature-b");
		expect(notifications[0]?.message).toContain("side (subtree: side -> side-2)");
		expect(commandMessagesText(messages)).toContain("Land or move the sibling stack first (e.g. gt move --onto main), then rerun /code:land.");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] !== "trunk")).toBe(false);
	});

	test("--dry-run on a forked stack also refuses", async () => {
		const { pi, notifications } = await runLandStack("--dry-run", repoIntro({ dbRows: DB_FORKED_ANCESTOR }));

		pi.assertDone();
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("Refusing to land: the stack forks at feature-a.");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("refuses to land when the current branch has multiple children", async () => {
		const { pi, notifications } = await runLandStack("--yes", repoIntro({ dbRows: DB_FORKED_CURRENT }));

		pi.assertDone();
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain(
			"current branch feature-b has 2 children (feature-c, feature-d); /code:land supports at most one descendant chain target.",
		);
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("refuses when the current branch is not tracked in Graphite metadata", async () => {
		const untrackedDb = metadataDbJson([
			{ branch: TRUNK, children: ["feature-a"], trunk: true },
			{ branch: "feature-a", parent: TRUNK, children: [] },
		]);
		const { pi, notifications } = await runLandStack("--yes", repoIntro({ dbRows: untrackedDb }));

		pi.assertDone();
		expect(notifications[0]?.message).toContain(
			`Current branch ${CURRENT} is not tracked in Graphite metadata (${DB_PATH}); run gt track or gt get before landing.`,
		);
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("fails closed when the Graphite metadata DB is missing or unreadable", async () => {
		const script = [
			...repoIntro().slice(0, 4),
			step("sqlite3", TOPOLOGY_ARGS, { code: 1, stderr: "Error: unable to open database file\n" }),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain(`Graphite metadata DB at ${DB_PATH} is missing or unreadable; refusing to land.`);
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("fails closed when sqlite3 cannot run", async () => {
		const script = [
			...repoIntro().slice(0, 4),
			step("sqlite3", TOPOLOGY_ARGS, { code: 1, stderr: "spawn sqlite3 ENOENT" }),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("sqlite3 could not read the Graphite metadata DB");
		expect(notifications[0]?.message).toContain("Ensure sqlite3 is installed and on PATH");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("stops hard when a required gt get target moved since landing started", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureA({ includeCleanup: false }),
			guardShaStep("feature-b", SHA_C),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			`local branch feature-b moved from ${shortSha(SHA_B)} to ${shortSha(SHA_C)} since landing started; refusing gt get --force to avoid clobbering local commits`,
		);
		expect(streamText).toContain("refs/ccc/land-backup");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "get")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(false);
		expect(
			pi.execCalls
				.filter((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge")
				.map((call) => call.args[2]),
		).toEqual(["101"]);
	});

	test("stops hard when a mid-stack branch grows unexpected children before delete", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureA({ includeCleanup: false }),
			guardShaStep("feature-b", SHA_B),
			step("gt", ["get", "feature-b", "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"]),
			childrenRecheckStep("feature-a", ["feature-b", "rogue-branch"]),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("feature-a now has unexpected Graphite children (rogue-branch); refusing gt delete");
		expect(streamText).toContain("refs/ccc/land-backup");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "restack")).toBe(false);
		expect(
			pi.execCalls
				.filter((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge")
				.map((call) => call.args[2]),
		).toEqual(["101"]);
	});

	test("skips the final delete with a warning when unexpected children appear", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSteps.slice(0, -2),
			childrenRecheckStep("feature-a", ["rogue-branch"]),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("warning");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("feature-a now has unexpected Graphite children (rogue-branch)");
		expect(streamText).toContain("local branch feature-a cleanup was skipped");
		expect(streamText).toContain("refs/ccc/land-backup");
		expect(streamText).toContain("Landed 1 PR: #101 feature-a.");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "restack")).toBe(false);
	});
});
