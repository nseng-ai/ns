import { describe, expect, test } from "vitest";
import { formatCommand, type ExecResult } from "@sdl/core/command";
import { ScriptedQueue } from "@sdl/test-kit";
import { shortSha } from "../../src/land-stack/command-exec.ts";
import { type LandStackResult } from "../../src/land-stack/errors.ts";
import { executeStackLanding, parseArgs, registerLandStackRenderer } from "../../src/land-stack.ts";
import type {
	LandStackExtensionAPI,
	LandStackCommandContext,
	NotifyLevel,
	PullRequestSnapshot,
} from "../../src/land-stack/types.ts";
import { metadataDbJson, TOPOLOGY_COMMAND, topologyArgs } from "./land-test-helpers.ts";

const PR_FIELDS =
	"number,title,body,state,isDraft,headRefName,baseRefName,headRefOid,mergeStateStatus,url,mergedAt";

const ROOT = "/repo";

const TRUNK = "main";

const CURRENT = "feature-b";

const DESCENDANT = "feature-c";

const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const SHA_C = "cccccccccccccccccccccccccccccccccccccccc";

const GIT_COMMON_DIR = `${ROOT}/.git`;

const DB_PATH = `${GIT_COMMON_DIR}/.graphite_metadata.db`;

const TOPOLOGY_ARGS = topologyArgs(DB_PATH);

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

const BRANCH_SHAS: Record<string, string> = {
	"feature-a": SHA_A,
	"feature-b": SHA_B,
	[DESCENDANT]: SHA_C,
};

type MessageRenderer = Parameters<NonNullable<LandStackExtensionAPI["registerMessageRenderer"]>>[1];

type SentMessage = Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[0] & {
	options?: Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[1];
};

interface ExecCall {
	command: string;
	args: string[];
	options?: { cwd?: string; timeout?: number };
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
	options?: { placement?: "aboveEditor" | "belowEditor" };
}

class FakePi implements LandStackExtensionAPI {
	readonly execCalls: ExecCall[] = [];
	readonly messageRenderers = new Map<string, MessageRenderer>();
	readonly messages: SentMessage[] = [];
	private readonly script: ScriptedQueue<ScriptedExec>;

	constructor(script: ScriptedExec[] = []) {
		this.script = new ScriptedQueue(script, (step) => step);
	}

	registerMessageRenderer(customType: string, renderer: MessageRenderer): void {
		this.messageRenderers.set(customType, renderer);
	}

	sendMessage(
		message: Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[0],
		options?: SentMessage["options"],
	): void {
		this.messages.push({ ...message, ...(options === undefined ? {} : { options }) });
	}

	async exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult> {
		this.execCalls.push({
			command,
			args: [...args],
			...(options === undefined ? {} : { options }),
		});
		const missingStepMessage = `unexpected exec: ${formatCommand(command, args)}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return execResult({ code: 99, stderr: missingStepMessage });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${formatCommand(expected.command, expected.args)}, got ${formatCommand(command, args)}`;
			this.script.recordError(message);
			return execResult({ code: 99, stderr: message });
		}

		return execResult(expected.result);
	}

	assertDone(): void {
		this.script.assertDone();
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
		...(overrides.startupError === undefined ? {} : { startupError: overrides.startupError }),
	};
}

function expectSuccess<T>(result: LandStackResult<T>): T {
	expect(result.type).toBe("success");
	if (result.type !== "success") {
		throw new Error(`Expected land-stack success, got failure: ${result.failure.message}`);
	}
	return result.value;
}

function step(command: string, args: string[], result?: Partial<ExecResult>): ScriptedExec {
	return { command, args, result };
}

const BACKUP_ROTATION_ARGS = [
	"fetch",
	"--quiet",
	"--prune",
	"--no-tags",
	".",
	"+refs/ccc/land-backup/*:refs/ccc/land-backup-prev/*",
];

const BACKUP_ROTATION_STEP = step("git", BACKUP_ROTATION_ARGS);

function expectedSquashMergeArgs(options: {
	number: number;
	sha: string;
	title?: string;
	body?: string | null;
}): string[] {
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
			setWidget(
				key: string,
				value: string[] | undefined,
				options?: { placement?: "aboveEditor" | "belowEditor" },
			): void {
				widgets.push({ key, value, ...(options === undefined ? {} : { options }) });
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
	title?: string;
	body?: string | null;
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

function metadataBranchNames(dbRows: string): string[] {
	const parsed = JSON.parse(dbRows) as Array<{ branch_name?: unknown }>;
	return parsed
		.map((row) => row.branch_name)
		.filter((name): name is string => typeof name === "string");
}

function repoIntro(
	options: {
		current?: string;
		trunk?: string;
		dbRows?: string;
		liveBranches?: string[];
	} = {},
): ScriptedExec[] {
	const dbRows = options.dbRows ?? DB_WITH_DESCENDANT;
	const liveBranches = options.liveBranches ?? metadataBranchNames(dbRows);
	return [
		step("git", ["rev-parse", "--show-toplevel"], { stdout: `${ROOT}\n` }),
		step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${options.current ?? CURRENT}\n` }),
		step("gt", ["trunk", "--no-interactive"], { stdout: `${options.trunk ?? TRUNK}\n` }),
		step("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
			stdout: `${GIT_COMMON_DIR}\n`,
		}),
		step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, { stdout: `${dbRows}\n` }),
		step(
			"git",
			["for-each-ref", "--format=%(refname:short)%09%(committerdate:iso-strict)", "refs/heads"],
			{
				stdout: liveBranches.length > 0 ? `${liveBranches.join("\n")}\n` : "",
			},
		),
	];
}

function backupRefSteps(
	branches: string[],
	options: { shas?: Record<string, string>; staleCurrentRefs?: string[] } = {},
): ScriptedExec[] {
	const { shas = BRANCH_SHAS, staleCurrentRefs = [] } = options;
	return [
		BACKUP_ROTATION_STEP,
		step("git", ["for-each-ref", "--format=%(refname)", "refs/ccc/land-backup"], {
			stdout: staleCurrentRefs.join("\n"),
		}),
		...staleCurrentRefs.map((ref) => step("git", ["update-ref", "-d", ref])),
		...branches.flatMap((branch) => {
			const sha = shas[branch] ?? SHA_A;
			return [
				step("git", ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], {
					stdout: `${sha}\n`,
				}),
				step("git", ["update-ref", `refs/ccc/land-backup/${branch}`, sha]),
			];
		}),
	];
}

function guardShaStep(branch: string, sha: string): ScriptedExec {
	return step("git", ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], {
		stdout: `${sha}\n`,
	});
}

function postRestackSubmitCheckSteps(options: {
	branch: string;
	sha: string;
	prNumber: number;
	base: string;
	state?: string;
	isDraft?: boolean;
}): ScriptedExec[] {
	return [
		guardShaStep(options.branch, options.sha),
		step("gh", ["pr", "view", options.branch, "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: options.prNumber,
					branch: options.branch,
					base: options.base,
					sha: options.sha,
					...(options.state === undefined ? {} : { state: options.state }),
					...(options.isDraft === undefined ? {} : { isDraft: options.isDraft }),
				}),
			),
		}),
	];
}

function submitUpdateStep(branch: string): ScriptedExec {
	return step("gt", [
		"submit",
		"--branch",
		branch,
		"--no-stack",
		"--update-only",
		"--no-edit",
		"--no-ai",
		"--no-interactive",
	]);
}

function childrenRecheckStep(branch: string, children: string[]): ScriptedExec {
	return step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, {
		stdout: `${metadataDbJson([{ branch, children }])}\n`,
	});
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

function initialBranchPlans(options: { featureBBase?: string } = {}): ScriptedExec[] {
	return [
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
			stdout: `${SHA_A}\n`,
		}),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
			stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A })),
		}),
		step("git", ["rev-parse", "--verify", "refs/heads/feature-b^{commit}"], {
			stdout: `${SHA_B}\n`,
		}),
		step("gh", ["pr", "view", "feature-b", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: 102,
					branch: "feature-b",
					base: options.featureBBase ?? "feature-a",
					sha: SHA_B,
				}),
			),
		}),
	];
}

function featureStackPreflight(
	options: {
		dbRows?: string;
		worktrees?: string;
		featureBBase?: string;
	} = {},
): ScriptedExec[] {
	const dbRows = options.dbRows ?? DB_WITH_DESCENDANT;
	const hasDescendants = dbRows.includes(DESCENDANT);
	const worktrees = options.worktrees ?? worktreeOutput([{ path: ROOT, branch: CURRENT }]);
	return [
		...repoIntro({ dbRows }),
		...cleanRepoChecks(),
		...localBranchChecks(["feature-a", "feature-b"]),
		...initialBranchPlans(
			options.featureBBase === undefined ? {} : { featureBBase: options.featureBBase },
		),
		step("git", ["worktree", "list", "--porcelain"], { stdout: worktrees }),
		...(hasDescendants
			? [step("git", ["worktree", "list", "--porcelain"], { stdout: worktrees })]
			: []),
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
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
			stdout: `${SHA_A}\n`,
		}),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: 101,
					branch: "feature-a",
					base: TRUNK,
					sha: SHA_A,
					...(options.title === undefined ? {} : { title: options.title }),
					...(options.body === undefined ? {} : { body: options.body }),
				}),
			),
		}),
		step(
			"gh",
			expectedSquashMergeArgs({
				number: 101,
				sha: SHA_A,
				...(options.title === undefined ? {} : { title: options.title }),
				...(options.body === undefined ? {} : { body: options.body }),
			}),
			{
				code: options.mergeCode ?? 0,
				stderr: options.mergeCode ? "merge blocked" : "",
			},
		),
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
				step("gt", [
					"get",
					refreshTarget,
					"--downstack",
					"--no-restack",
					"--no-checkout",
					"--force",
					"--no-interactive",
				]),
			);
		}
		steps.push(
			childrenRecheckStep("feature-a", ["feature-b"]),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
			step("gt", ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"]),
			...postRestackSubmitCheckSteps({
				branch: "feature-b",
				sha: SHA_B,
				prNumber: 102,
				base: "feature-a",
			}),
		);
		// post-restack refresh of the next forced-refresh target (the auto-maintained
		// descendant); skipped-maintenance scenarios pass null because there is no
		// later gt get to guard.
		const postRestackRefresh =
			options.postRestackRefresh === undefined ? DESCENDANT : options.postRestackRefresh;
		if (postRestackRefresh) {
			steps.push(guardShaStep(postRestackRefresh, BRANCH_SHAS[postRestackRefresh] ?? SHA_C));
		}
		steps.push(submitUpdateStep("feature-b"));
	}
	return steps;
}

function singleBranchPreflightWithRefs(options: {
	localSha: string;
	prSha: string;
	worktrees?: string;
	dbRows?: string;
}): ScriptedExec[] {
	return [
		...repoIntro({ current: "feature-a", dbRows: options.dbRows ?? DB_SINGLE_BRANCH }),
		...cleanRepoChecks(),
		...localBranchChecks(["feature-a"]),
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
			stdout: `${options.localSha}\n`,
		}),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: options.prSha }),
			),
		}),
		step("git", ["worktree", "list", "--porcelain"], {
			stdout: options.worktrees ?? worktreeOutput([{ path: ROOT, branch: "feature-a" }]),
		}),
	];
}

function mergeFeatureAThroughDelete(
	options: { refreshTarget?: string | null; title?: string; body?: string | null } = {},
): ScriptedExec[] {
	const steps = [
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
			stdout: `${SHA_A}\n`,
		}),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: 101,
					branch: "feature-a",
					base: TRUNK,
					sha: SHA_A,
					...(options.title === undefined ? {} : { title: options.title }),
					...(options.body === undefined ? {} : { body: options.body }),
				}),
			),
		}),
		step(
			"gh",
			expectedSquashMergeArgs({
				number: 101,
				sha: SHA_A,
				...(options.title === undefined ? {} : { title: options.title }),
				...(options.body === undefined ? {} : { body: options.body }),
			}),
		),
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
			step("gt", [
				"get",
				refreshTarget,
				"--downstack",
				"--no-restack",
				"--no-checkout",
				"--force",
				"--no-interactive",
			]),
		);
	}
	steps.push(
		childrenRecheckStep("feature-a", refreshTarget ? ["feature-b"] : []),
		step("gt", ["delete", "feature-a", "-f", "-q"]),
	);
	return steps;
}

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
		const { pi, notifications, messages } = await runLandStack(
			"--yes",
			repoIntro({ dbRows: DB_FORKED_ANCESTOR }),
		);

		pi.assertDone();
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("Refusing to land: the stack forks at feature-a.");
		expect(notifications[0]?.message).toContain("Landing path expects feature-a -> feature-b");
		expect(notifications[0]?.message).toContain("side (subtree: side -> side-2)");
		expect(commandMessagesText(messages)).toContain(
			"Land or move the sibling stack first (e.g. gt move --onto main), then rerun /sdl:flow:land.",
		);
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] !== "trunk")).toBe(
			false,
		);
	});

	test("--dry-run on a forked stack also refuses", async () => {
		const { pi, notifications } = await runLandStack(
			"--dry-run",
			repoIntro({ dbRows: DB_FORKED_ANCESTOR }),
		);

		pi.assertDone();
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("Refusing to land: the stack forks at feature-a.");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("refuses to land when the current branch has multiple children", async () => {
		const { pi, notifications } = await runLandStack(
			"--yes",
			repoIntro({ dbRows: DB_FORKED_CURRENT }),
		);

		pi.assertDone();
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain(
			"current branch feature-b has 2 children (feature-c, feature-d); /sdl:flow:land supports at most one descendant chain target.",
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
			step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, {
				code: 1,
				stderr: "Error: unable to open database file\n",
			}),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain(
			`Graphite metadata DB at ${DB_PATH} is missing or unreadable; refusing to land.`,
		);
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("fails closed when sqlite3 cannot run", async () => {
		const script = [
			...repoIntro().slice(0, 4),
			step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, { code: 1, stderr: "spawn sqlite3 ENOENT" }),
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
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "get")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
				.map((call) => call.args[2]),
		).toEqual(["101"]);
	});

	test("stops hard when a mid-stack branch grows unexpected children before delete", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureA({ includeCleanup: false }),
			guardShaStep("feature-b", SHA_B),
			step("gt", [
				"get",
				"feature-b",
				"--downstack",
				"--no-restack",
				"--no-checkout",
				"--force",
				"--no-interactive",
			]),
			childrenRecheckStep("feature-a", ["feature-b", "rogue-branch"]),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			"feature-a now has unexpected Graphite children (rogue-branch); refusing gt delete",
		);
		expect(streamText).toContain("refs/ccc/land-backup");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "restack")).toBe(
			false,
		);
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
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
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "restack")).toBe(
			false,
		);
	});
});
