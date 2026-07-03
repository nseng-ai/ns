import { describe, expect, test, vi } from "vitest";

import type { Caps } from "@sdl/clinkr";
import { stripAnsi } from "@sdl/clinkr/testing";
import type { SdlConfirmOptions } from "@sdl/kernel/sdk";
import { ScriptedQueue } from "@sdl/core/test-kit";
import {
	parsePullRequestView,
	registerLandCommand,
	runLandCli,
	type ExecResult,
	type LandCommandContext,
	type LandExtensionAPI,
	type NotifyLevel,
} from "@sdl/ccc/land";
import { metadataDbJson, TOPOLOGY_COMMAND, topologyArgs } from "./land-test-helpers.ts";

const ROOT = "/repo";
const CURRENT = "feature-branch";
const TRUNK = "main";
const PR_VIEW_FIELDS =
	"number,title,body,state,isDraft,headRefName,baseRefName,headRefOid,mergeStateStatus,url,mergedAt";
const PR_VIEW_ARGS = ["pr", "view", CURRENT, "--json", PR_VIEW_FIELDS];
const PR_VERIFY_ARGS = ["pr", "view", "42", "--json", PR_VIEW_FIELDS];
const PR_VIEW_TIMEOUT_MS = 30_000;
const PR_MERGE_TIMEOUT_MS = 120_000;
const STACK_PR_VIEW_FIELDS = PR_VIEW_FIELDS;
const GIT_TIMEOUT_MS = 30_000;
const CORE_GIT_TIMEOUT_MS = 10_000;
const GT_TIMEOUT_MS = 120_000;
const SQLITE_TIMEOUT_MS = 30_000;
const GIT_ROOT_ARGS = ["rev-parse", "--show-toplevel"];
const GIT_CURRENT_ARGS = ["symbolic-ref", "--short", "HEAD"];
const GT_TRUNK_ARGS = ["trunk", "--no-interactive"];
const GIT_COMMON_DIR_ARGS = ["rev-parse", "--path-format=absolute", "--git-common-dir"];
const GIT_FOR_EACH_REF_ARGS = [
	"for-each-ref",
	"--format=%(refname:short)%09%(objectname)%09%(committerdate:iso-strict)",
	"refs/heads",
];
const DB_PATH = `${ROOT}/.git/.graphite_metadata.db`;
const TOPOLOGY_ARGS = topologyArgs(DB_PATH);
const SHA_CURRENT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_CHILD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CHILD_BRANCH = "child-branch";
// Mirrors Flow's backup-ref command contract exercised through sdl-flow/api;
// keep local to avoid exporting or deep-importing Flow land-stack internals.
const FLOW_LAND_BACKUP_REF_NAMESPACE = "refs/sdl/flow-land-backup";
const FLOW_LAND_BACKUP_PREV_REF_NAMESPACE = "refs/sdl/flow-land-backup-prev";

const DB_SINGLE_BRANCH = metadataDbJson([
	{ branch: TRUNK, children: [CURRENT], trunk: true },
	{ branch: CURRENT, parent: TRUNK, children: [] },
]);
const DB_WITH_DESCENDANT = metadataDbJson([
	{ branch: TRUNK, children: [CURRENT], trunk: true },
	{ branch: CURRENT, parent: TRUNK, children: [CHILD_BRANCH] },
	{ branch: CHILD_BRANCH, parent: CURRENT, children: [] },
]);
const DB_WITH_FORKED_LANDING_PATH = metadataDbJson([
	{ branch: TRUNK, children: ["fork-point"], trunk: true },
	{ branch: "fork-point", parent: TRUNK, children: [CURRENT, "sibling-branch"] },
	{ branch: CURRENT, parent: "fork-point", children: [] },
	{ branch: "sibling-branch", parent: "fork-point", children: [] },
]);

type RegisteredCommand = Parameters<LandExtensionAPI["registerCommand"]>[1];
type CustomMessage = Parameters<NonNullable<LandExtensionAPI["sendMessage"]>>[0];

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
	options?: SdlConfirmOptions;
}

class FakePi implements LandExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	private readonly script: ScriptedQueue<ScriptedExec>;

	constructor(script: ScriptedExec[] = []) {
		this.script = new ScriptedQueue(script, (step) => step);
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	async exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const missingStepMessage = `unexpected exec: ${command} ${args.join(" ")}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return execResult({ code: 99, stderr: missingStepMessage });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.script.recordError(message);
			return execResult({ code: 99, stderr: message });
		}

		return execResult(expected.result);
	}

	assertDone(): void {
		this.script.assertDone();
	}
}

class FakePiWithMessages extends FakePi {
	readonly sentMessages: CustomMessage[] = [];
	readonly renderers = new Map<string, unknown>();

	registerMessageRenderer(customType: string, renderer: unknown): void {
		this.renderers.set(customType, renderer);
	}

	sendMessage(message: CustomMessage): void {
		this.sentMessages.push(message);
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

function createContext(options: { cwd?: string; mode?: LandCommandContext["mode"] } = {}): {
	ctx: LandCommandContext;
	notifications: Notification[];
	confirmations: Confirmation[];
	printed: string[];
	statuses: Array<[string, string | undefined]>;
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const confirmations: Confirmation[] = [];
	const printed: string[] = [];
	const statuses: Array<[string, string | undefined]> = [];
	let waits = 0;

	const ctx: LandCommandContext = {
		cwd: options.cwd ?? ROOT,
		hasUI: true,
		...(options.mode === undefined ? {} : { mode: options.mode }),
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async confirm(title: string, message: string, options?: SdlConfirmOptions): Promise<boolean> {
				confirmations.push({ title, message, ...(options === undefined ? {} : { options }) });
				return false;
			},
			setStatus(key: string, value: string | undefined): void {
				statuses.push([key, value]);
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
		printOutput: {
			write(chunk: string): unknown {
				printed.push(chunk);
				return undefined;
			},
		},
	};

	return { ctx, notifications, confirmations, printed, statuses, waitForIdleCalls: () => waits };
}

async function runLand(
	script: ScriptedExec[],
	options: { mode?: LandCommandContext["mode"]; stack?: string | false; args?: string } = {},
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	confirmations: Confirmation[];
	printed: string[];
	waitForIdleCalls: () => number;
}> {
	const fullScript =
		options.stack === false
			? script
			: [...graphiteShapeSteps(options.stack ?? DB_SINGLE_BRANCH), ...script];
	const pi = new FakePi(fullScript);
	registerLandCommand(pi);
	const command = pi.commands.get("sdl:flow:land");
	expect(command).toBeDefined();
	const context = createContext({ mode: options.mode });
	await command?.handler(options.args ?? "", context.ctx);
	return { pi, ...context };
}

function metadataBranchNames(dbRows: string): string[] {
	const parsed = JSON.parse(dbRows) as Array<{ branch_name?: unknown }>;
	return parsed
		.map((row) => row.branch_name)
		.filter((name): name is string => typeof name === "string");
}

function graphiteShapeSteps(dbRows: string): ScriptedExec[] {
	return graphiteShapeStepsForRoot(ROOT, dbRows);
}

function graphiteShapeStepsForRoot(root: string, dbRows: string): ScriptedExec[] {
	const liveBranches = metadataBranchNames(dbRows);
	return [
		step("git", GIT_ROOT_ARGS, { stdout: `${root}\n` }),
		step("git", GIT_CURRENT_ARGS, { stdout: `${CURRENT}\n` }),
		step("gt", GT_TRUNK_ARGS, { stdout: `${TRUNK}\n` }),
		step("git", GIT_COMMON_DIR_ARGS, { stdout: `${root}/.git\n` }),
		step(TOPOLOGY_COMMAND, topologyArgs(`${root}/.git/.graphite_metadata.db`), {
			stdout: `${dbRows}\n`,
		}),
		step("git", GIT_FOR_EACH_REF_ARGS, {
			stdout: liveBranches.length > 0 ? `${liveBranches.join("\n")}\n` : "",
		}),
	];
}

function expectedShapeCalls(options: { forEachRef?: boolean } = {}): ExecCall[] {
	const calls: ExecCall[] = [
		{ command: "git", args: GIT_ROOT_ARGS, options: { cwd: ROOT, timeout: GIT_TIMEOUT_MS } },
		{ command: "git", args: GIT_CURRENT_ARGS, options: { cwd: ROOT, timeout: GIT_TIMEOUT_MS } },
		{ command: "gt", args: GT_TRUNK_ARGS, options: { cwd: ROOT, timeout: GT_TIMEOUT_MS } },
		{ command: "git", args: GIT_COMMON_DIR_ARGS, options: { cwd: ROOT, timeout: GIT_TIMEOUT_MS } },
		{
			command: TOPOLOGY_COMMAND,
			args: TOPOLOGY_ARGS,
			options: { cwd: ROOT, timeout: SQLITE_TIMEOUT_MS },
		},
	];
	if (options.forEachRef !== false) {
		calls.push({
			command: "git",
			args: GIT_FOR_EACH_REF_ARGS,
			options: { cwd: ROOT, timeout: CORE_GIT_TIMEOUT_MS },
		});
	}
	return calls;
}

function prView(
	overrides: {
		number?: number;
		headRefName?: string;
		baseRefName?: string;
		title?: string;
		body?: string | null;
		headRefOid?: string;
		state?: string;
		mergedAt?: string | null;
	} = {},
): string {
	return JSON.stringify({
		number: overrides.number ?? 42,
		headRefName: overrides.headRefName ?? "feature-branch",
		baseRefName: overrides.baseRefName ?? TRUNK,
		title: overrides.title ?? "Ship feature",
		body: overrides.body === undefined ? "Feature body" : overrides.body,
		state: overrides.state ?? "OPEN",
		isDraft: false,
		headRefOid: overrides.headRefOid ?? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		mergedAt: overrides.mergedAt ?? null,
	});
}

function mergedPrView(): string {
	return prView({ state: "MERGED", mergedAt: "2026-07-02T00:00:00Z" });
}

function expectedMergeArgs(
	options: { number?: number; sha?: string; title?: string; body?: string } = {},
): string[] {
	return [
		"pr",
		"merge",
		String(options.number ?? 42),
		"--squash",
		"--match-head-commit",
		options.sha ?? SHA_CURRENT,
		"--subject",
		options.title ?? "Ship feature",
		"--body",
		options.body ?? "Feature body",
	];
}

function expectedStackMergeArgs(
	options: { number?: number; sha?: string; title?: string; body?: string } = {},
): string[] {
	return [
		"pr",
		"merge",
		String(options.number ?? 42),
		"--squash",
		"--match-head-commit",
		options.sha ?? SHA_CURRENT,
		"--subject",
		options.title ?? "Ship feature",
		"--body",
		options.body ?? "Feature body",
	];
}

function stackPrView(
	options: {
		number?: number;
		branch?: string;
		base?: string;
		sha?: string;
		state?: string;
		mergedAt?: string | null;
	} = {},
): string {
	return JSON.stringify({
		number: options.number ?? 42,
		title: "Ship feature",
		body: "Feature body",
		state: options.state ?? "OPEN",
		isDraft: false,
		headRefName: options.branch ?? CURRENT,
		baseRefName: options.base ?? TRUNK,
		headRefOid: options.sha ?? SHA_CURRENT,
		mergeStateStatus: "CLEAN",
		url: `https://github.example/pull/${options.number ?? 42}`,
		mergedAt: options.mergedAt ?? null,
	});
}

function postRestackSubmitCheckSteps(): ScriptedExec[] {
	return [
		step("git", ["rev-parse", "--verify", `refs/heads/${CHILD_BRANCH}^{commit}`], {
			stdout: `${SHA_CHILD}\n`,
		}),
		step("gh", ["pr", "view", CHILD_BRANCH, "--json", STACK_PR_VIEW_FIELDS], {
			stdout: stackPrView({ number: 43, branch: CHILD_BRANCH, base: CURRENT, sha: SHA_CHILD }),
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

function successfulStackLandingSteps(): ScriptedExec[] {
	const worktrees = worktreeOutput([{ path: ROOT, branch: CURRENT }]);
	return [
		...cleanRepoChecks(),
		step("git", ["show-ref", "--verify", `refs/heads/${CURRENT}`]),
		step("git", ["rev-parse", "--verify", `refs/heads/${CURRENT}^{commit}`], {
			stdout: `${SHA_CURRENT}\n`,
		}),
		step("gh", ["pr", "view", CURRENT, "--json", STACK_PR_VIEW_FIELDS], {
			stdout: stackPrView(),
		}),
		step("git", ["worktree", "list", "--porcelain"], { stdout: worktrees }),
		step("git", ["worktree", "list", "--porcelain"], { stdout: worktrees }),
		step("git", [
			"fetch",
			"--quiet",
			"--prune",
			"--no-tags",
			".",
			`+${FLOW_LAND_BACKUP_REF_NAMESPACE}/*:${FLOW_LAND_BACKUP_PREV_REF_NAMESPACE}/*`,
		]),
		step("git", ["for-each-ref", "--format=%(refname)", FLOW_LAND_BACKUP_REF_NAMESPACE]),
		step("git", ["rev-parse", "--verify", `refs/heads/${CURRENT}^{commit}`], {
			stdout: `${SHA_CURRENT}\n`,
		}),
		step("git", ["update-ref", `${FLOW_LAND_BACKUP_REF_NAMESPACE}/${CURRENT}`, SHA_CURRENT]),
		step("git", ["rev-parse", "--verify", `refs/heads/${CHILD_BRANCH}^{commit}`], {
			stdout: `${SHA_CHILD}\n`,
		}),
		step("git", ["update-ref", `${FLOW_LAND_BACKUP_REF_NAMESPACE}/${CHILD_BRANCH}`, SHA_CHILD]),
		step("git", ["rev-parse", "--verify", `refs/heads/${CURRENT}^{commit}`], {
			stdout: `${SHA_CURRENT}\n`,
		}),
		step("gh", ["pr", "view", CURRENT, "--json", STACK_PR_VIEW_FIELDS], {
			stdout: stackPrView(),
		}),
		step("gh", expectedStackMergeArgs(), { stdout: "Merged pull request #42" }),
		step("gh", ["pr", "view", "42", "--json", STACK_PR_VIEW_FIELDS], {
			stdout: stackPrView({ state: "MERGED", mergedAt: "2026-05-22T00:00:00Z" }),
		}),
		step("git", ["rev-parse", "--verify", `refs/heads/${CHILD_BRANCH}^{commit}`], {
			stdout: `${SHA_CHILD}\n`,
		}),
		step("gt", [
			"get",
			CHILD_BRANCH,
			"--downstack",
			"--no-restack",
			"--no-checkout",
			"--force",
			"--no-interactive",
		]),
		step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, {
			stdout: `${metadataDbJson([{ branch: CURRENT, children: [CHILD_BRANCH] }])}\n`,
		}),
		step("gt", ["delete", CURRENT, "-f", "-q"]),
		step("gt", ["restack", "--branch", CHILD_BRANCH, "--upstack", "--no-interactive"]),
		...postRestackSubmitCheckSteps(),
		step("gt", [
			"submit",
			"--branch",
			CHILD_BRANCH,
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
			"--force",
		]),
	];
}

describe("code land command registration", () => {
	test("registers only the namespaced sdl:flow:land command", () => {
		const pi = new FakePi();
		registerLandCommand(pi);

		expect([...pi.commands.keys()]).toEqual(["sdl:flow:land"]);
		expect(pi.commands.has("gh:land")).toBe(false);
		expect(pi.commands.has("land")).toBe(false);
		const command = pi.commands.get("sdl:flow:land");
		expect(command?.description).toBe("Land the current PR or Graphite stack into trunk");
		expect(command?.getArgumentCompletions?.("--")).toEqual([
			{ value: "--yes", label: "--yes" },
			{ value: "--dry-run", label: "--dry-run" },
			{ value: "--free", label: "--free" },
			{ value: "--force", label: "--force" },
			{ value: "--verbose", label: "--verbose" },
			{ value: "--help", label: "--help" },
		]);
	});
});

describe("code land CLI bridge", () => {
	test("returns failure when non-UI Graphite shape refusal is presented", async () => {
		const pi = new FakePi(graphiteShapeSteps(DB_WITH_FORKED_LANDING_PATH));
		const stdout: string[] = [];
		const stderr: string[] = [];
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		let exitCode = 0;

		try {
			exitCode = await runLandCli({
				cwd: ROOT,
				rawArgs: "--dry-run",
				exec: async (command, args, options) =>
					await pi.exec(command, args, {
						...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
						...(options?.timeout === undefined ? {} : { timeout: options.timeout }),
					}),
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
			});

			expect(exitCode).toBe(1);
			expect(stdout.join("")).toBe("");
			expect(stderr.join("")).toContain("land stopped.");
			expect(stderr.join("")).toContain("Refusing to land: the stack forks at fork-point.");
			expect(consoleError).not.toHaveBeenCalled();
			pi.assertDone();
		} finally {
			consoleError.mockRestore();
		}
	});

	test("prints live stack progress and one final success summary", async () => {
		const pi = new FakePi([
			...graphiteShapeSteps(DB_WITH_DESCENDANT),
			...successfulStackLandingSteps(),
		]);
		let stdout = "";
		let stderr = "";

		const exitCode = await runLandCli({
			cwd: ROOT,
			rawArgs: "--yes",
			exec: async (command, args, options) => await pi.exec(command, args, options),
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
		});

		expect(exitCode).toBe(0);
		expect(stderr).toContain("✗ $ git rev-parse -q --verify MERGE_HEAD — exit 1");
		expect(stderr).toContain("→ Preparing to land 1 PR through feature-branch...");
		expect(stderr).toContain("✓ $ git status --porcelain=v1");
		expect(stderr).toContain("→ Merging PR #42 feature-branch...");
		expect(stderr).toContain("→ Merged and verified PR #42 feature-branch.");
		expect(stderr).toContain("→ Refreshing stack through child-branch...");
		expect(stderr).toContain("→ Cleaning up local branch feature-branch...");
		expect(stderr).not.toContain("Landed 1 PR: #42 feature-branch.");
		expect(stdout).toContain("Landed 1 PR: #42 feature-branch.");
		expect(stdout.match(/Landed 1 PR: #42 feature-branch\./g)).toHaveLength(1);
		pi.assertDone();
	});

	test("prints intermediate progress after injected confirmation", async () => {
		const pi = new FakePi([
			...graphiteShapeSteps(DB_WITH_DESCENDANT),
			...successfulStackLandingSteps(),
		]);
		const confirmations: Confirmation[] = [];
		let stdout = "";
		let stderr = "";

		const exitCode = await runLandCli({
			cwd: ROOT,
			rawArgs: "",
			exec: async (command, args, options) => await pi.exec(command, args, options),
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
			confirm: (title, message) => {
				confirmations.push({ title, message });
				return true;
			},
		});

		expect(exitCode).toBe(0);
		expect(confirmations).toHaveLength(1);
		expect(stderr).toContain("→ Preparing to land 1 PR through feature-branch...");
		expect(stderr).toContain("→ Merging PR #42 feature-branch...");
		expect(stderr).toContain("→ Merged and verified PR #42 feature-branch.");
		expect(stderr).toContain("→ Refreshing stack through child-branch...");
		expect(stderr).toContain("→ Cleaning up local branch feature-branch...");
		expect(stderr).not.toContain("Landed 1 PR: #42 feature-branch.");
		expect(stdout).not.toBe("");
		pi.assertDone();
	});

	test("routes intermediate progress through onOutput when available", async () => {
		const pi = new FakePi([
			...graphiteShapeSteps(DB_WITH_DESCENDANT),
			...successfulStackLandingSteps(),
		]);
		let stdout = "";
		let stderr = "";
		const liveOutput: string[] = [];

		const exitCode = await runLandCli({
			cwd: ROOT,
			rawArgs: "",
			exec: async (command, args, options) => await pi.exec(command, args, options),
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
			onOutput: (stream, text) => {
				liveOutput.push(`${stream}:${text}`);
			},
			confirm: () => true,
		});

		expect(exitCode).toBe(0);
		expect(stderr).toBe("");
		expect(liveOutput.join("")).toContain(
			"stderr:→ Preparing to land 1 PR through feature-branch...",
		);
		expect(liveOutput.join("")).toContain("stderr:→ Merging PR #42 feature-branch...");
		expect(liveOutput.join("")).toContain("stderr:→ Cleaning up local branch feature-branch...");
		expect(liveOutput.join("")).not.toContain("Landed 1 PR: #42 feature-branch.");
		expect(stdout).not.toBe("");
		pi.assertDone();
	});

	test("emits transient command status when the CLI bridge has UI confirmation", async () => {
		const pi = new FakePi(graphiteShapeSteps(DB_WITH_FORKED_LANDING_PATH));
		let stdout = "";
		let stderr = "";
		const liveOutput: string[] = [];

		const exitCode = await runLandCli({
			cwd: ROOT,
			rawArgs: "--dry-run",
			exec: async (command, args, options) => await pi.exec(command, args, options),
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
			onOutput: (stream, text) => {
				liveOutput.push(`${stream}:${text}`);
			},
			confirm: () => true,
		});

		expect(exitCode).toBe(1);
		expect(stdout).toBe("");
		expect(stderr).toContain("Refusing to land: the stack forks at fork-point.");
		expect(liveOutput.join("")).toContain("stderr:land: running git rev-parse --show-toplevel...");
		expect(liveOutput.join("")).toContain("stderr:land: running gt trunk --no-interactive...");
		pi.assertDone();
	});
});

describe("code land command", () => {
	test("acknowledges the command before waiting for idle", async () => {
		const pi = new FakePiWithMessages([
			...graphiteShapeSteps(DB_SINGLE_BRANCH),
			step("gh", PR_VIEW_ARGS, { stdout: prView() }),
			step("gh", expectedMergeArgs(), { stdout: "Merged pull request #42" }),
			step("gh", PR_VERIFY_ARGS, { stdout: mergedPrView() }),
		]);
		registerLandCommand(pi);
		const command = pi.commands.get("sdl:flow:land");
		expect(command).toBeDefined();

		const context = createContext();
		const { statuses } = context;
		let releaseIdle: (() => void) | undefined;
		let isWaitStarted = false;
		context.ctx.waitForIdle = async () =>
			new Promise<void>((resolve) => {
				isWaitStarted = true;
				releaseIdle = resolve;
			});

		const handlerPromise = Promise.resolve(command?.handler("", context.ctx));

		expect(isWaitStarted).toBe(true);
		expect(pi.execCalls).toEqual([]);
		// Default command acknowledgements do not use the footer; this command reports
		// progress through its own notifications/output.
		expect(pi.sentMessages).toEqual([]);
		expect(statuses).toEqual([]);

		releaseIdle?.();
		await handlerPromise;
		pi.assertDone();
	});

	test("squash-merges the current PR with the PR title and body", async () => {
		const { pi, notifications, waitForIdleCalls } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: prView() }),
			step("gh", expectedMergeArgs(), { stdout: "Merged pull request #42" }),
			step("gh", PR_VERIFY_ARGS, { stdout: mergedPrView() }),
		]);

		expect(waitForIdleCalls()).toBe(1);
		expect(pi.execCalls).toEqual([
			...expectedShapeCalls(),
			{ command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } },
			{
				command: "gh",
				args: expectedMergeArgs(),
				options: { cwd: ROOT, timeout: PR_MERGE_TIMEOUT_MS },
			},
			{ command: "gh", args: PR_VERIFY_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } },
		]);
		expect(notifications).toEqual([
			{
				message: "Running gh pr merge --squash with PR title/body as commit message…",
				level: "info",
			},
			{
				message: "Merged pull request #42\nMerged PR #42; squash commit used PR title/body.",
				level: "info",
			},
		]);
		pi.assertDone();
	});

	test("--free --force frees the current managed slot and deletes the local Graphite branch after fast-path landing", async () => {
		const slotRoot = "/Users/me/.local/state/sdl/slots/repos/repo/worktrees/slot-01";
		const pi = new FakePi([
			...graphiteShapeStepsForRoot(slotRoot, DB_SINGLE_BRANCH),
			step("gh", PR_VIEW_ARGS, { stdout: prView() }),
			step("gh", expectedMergeArgs(), { stdout: "Merged pull request #42" }),
			step("gh", PR_VERIFY_ARGS, { stdout: mergedPrView() }),
			step("sdl", ["slot", "free", "--wt", "slot-01"]),
			step("gt", ["delete", CURRENT, "-f", "-q"]),
		]);
		registerLandCommand(pi);
		const command = pi.commands.get("sdl:flow:land");
		const context = createContext({ cwd: slotRoot });

		await command?.handler("--free --force", context.ctx);

		expect(context.confirmations).toEqual([]);
		expect(pi.execCalls.slice(-2)).toEqual([
			{
				command: "sdl",
				args: ["slot", "free", "--wt", "slot-01"],
				options: { cwd: slotRoot, timeout: 120_000 },
			},
			{
				command: "gt",
				args: ["delete", CURRENT, "-f", "-q"],
				options: { cwd: slotRoot, timeout: 600_000 },
			},
		]);
		expect(context.notifications.at(-1)).toEqual({
			message: `Post-landing cleanup complete: freed slot-01 and deleted local branch ${CURRENT}.`,
			level: "success",
		});
		pi.assertDone();
	});

	test("--free asks before post-landing cleanup", async () => {
		const slotRoot = "/Users/me/.local/state/sdl/slots/repos/repo/worktrees/slot-01";
		const pi = new FakePi([
			...graphiteShapeStepsForRoot(slotRoot, DB_SINGLE_BRANCH),
			step("gh", PR_VIEW_ARGS, { stdout: prView() }),
			step("gh", expectedMergeArgs(), { stdout: "Merged pull request #42" }),
			step("gh", PR_VERIFY_ARGS, { stdout: mergedPrView() }),
		]);
		registerLandCommand(pi);
		const command = pi.commands.get("sdl:flow:land");
		const context = createContext({ cwd: slotRoot });

		await command?.handler("--free", context.ctx);

		expect(context.confirmations).toEqual([
			{
				title: "Free current slot and delete local branch?",
				message: expect.stringContaining("$ sdl slot free --wt slot-01"),
			},
		]);
		expect(context.notifications.at(-1)).toEqual({
			message: `land stopped: Cancelled post-landing cleanup; PRs were landed but slot-01 and local branch ${CURRENT} were kept.`,
			level: "warning",
		});
		pi.assertDone();
	});

	test("prints command results in print mode", async () => {
		const { pi, notifications, printed } = await runLand(
			[
				step("gh", PR_VIEW_ARGS, { stdout: prView() }),
				step("gh", expectedMergeArgs(), { stdout: "Merged pull request #42" }),
				step("gh", PR_VERIFY_ARGS, { stdout: mergedPrView() }),
			],
			{ mode: "print" },
		);

		expect(printed).toEqual([
			"Running gh pr merge --squash with PR title/body as commit message…\n",
			"Merged pull request #42\nMerged PR #42; squash commit used PR title/body.\n",
		]);
		expect(notifications).toEqual([
			{
				message: "Running gh pr merge --squash with PR title/body as commit message…",
				level: "info",
			},
			{
				message: "Merged pull request #42\nMerged PR #42; squash commit used PR title/body.",
				level: "info",
			},
		]);
		pi.assertDone();
	});

	test("prints refusals in print mode", async () => {
		const { pi, printed } = await runLand(
			[step("gh", PR_VIEW_ARGS, { stdout: prView({ baseRefName: "develop" }) })],
			{ mode: "print" },
		);

		expect(printed).toEqual([
			"Refusing to land PR #42: base branch is 'develop', not Graphite trunk 'main'. Merge not attempted.\n",
		]);
		pi.assertDone();
	});

	test("passes an empty body when the PR body is null", async () => {
		const { pi } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: prView({ body: null }) }),
			step("gh", expectedMergeArgs({ body: "" })),
			step("gh", PR_VERIFY_ARGS, { stdout: mergedPrView() }),
		]);

		expect(pi.execCalls.at(-2)?.args).toEqual(expectedMergeArgs({ body: "" }));
		pi.assertDone();
	});

	test("refuses to merge PRs whose base branch is not Graphite trunk", async () => {
		const { pi, notifications } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: prView({ baseRefName: "develop" }) }),
		]);

		expect(pi.execCalls).toEqual([
			...expectedShapeCalls(),
			{ command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } },
		]);
		expect(notifications).toEqual([
			{
				message:
					"Refusing to land PR #42: base branch is 'develop', not Graphite trunk 'main'. Merge not attempted.",
				level: "error",
			},
		]);
		pi.assertDone();
	});

	test("reports gh pr view failures without attempting a merge", async () => {
		const { pi, notifications } = await runLand([
			step("gh", PR_VIEW_ARGS, { code: 1, stderr: "no pull requests found" }),
		]);

		expect(pi.execCalls).toEqual([
			...expectedShapeCalls(),
			{ command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } },
		]);
		expect(notifications).toEqual([
			{
				message:
					"Could not load GitHub PR for feature-branch.\n$ gh pr view feature-branch --json number,title,body,state,isDraft,headRefName,baseRefName,headRefOid,mergeStateStatus,url,mergedAt\nexit 1\n----- stdout tail -----\n(empty)\n----- stderr tail -----\nno pull requests found",
				level: "error",
			},
		]);
		pi.assertDone();
	});

	test("reports malformed gh pr view JSON without attempting a merge", async () => {
		const { pi, notifications } = await runLand([step("gh", PR_VIEW_ARGS, { stdout: "not json" })]);

		expect(pi.execCalls).toEqual([
			...expectedShapeCalls(),
			{ command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } },
		]);
		expect(notifications[0]?.message).toContain("Failed to parse gh pr view output");
		expect(notifications[0]?.message).toContain(
			"Failed to parse gh pr view output for feature-branch",
		);
		expect(notifications[0]?.level).toBe("error");
		pi.assertDone();
	});

	test("reports missing gh pr view fields without attempting a merge", async () => {
		const { pi, notifications } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: JSON.stringify({ number: 42, title: "Ship feature" }) }),
		]);

		expect(pi.execCalls).toEqual([
			...expectedShapeCalls(),
			{ command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } },
		]);
		expect(notifications).toEqual([
			{
				message: "gh pr view for feature-branch did not return required PR fields.",
				level: "error",
			},
		]);
		pi.assertDone();
	});

	test("reports gh pr merge failures with command output", async () => {
		const { pi, notifications } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: prView() }),
			step("gh", expectedMergeArgs(), { code: 1, stdout: "merge stdout", stderr: "merge stderr" }),
		]);

		expect(pi.execCalls).toHaveLength(8);
		expect(notifications).toEqual([
			{
				message: "Running gh pr merge --squash with PR title/body as commit message…",
				level: "info",
			},
			{
				message:
					"gh pr merge --squash with PR title/body failed for PR #42.\n$ gh pr merge 42 --squash --match-head-commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --subject 'Ship feature' --body 'Feature body'\nexit 1\n----- stdout tail -----\nmerge stdout\n----- stderr tail -----\nmerge stderr",
				level: "error",
			},
		]);
		pi.assertDone();
	});

	test("refuses when Graphite stack discovery fails without falling back to gh", async () => {
		const { pi, notifications } = await runLand(
			[
				step("git", GIT_ROOT_ARGS, { stdout: `${ROOT}\n` }),
				step("git", GIT_CURRENT_ARGS, { stdout: `${CURRENT}\n` }),
				step("gt", GT_TRUNK_ARGS, { stdout: `${TRUNK}\n` }),
				step("git", GIT_COMMON_DIR_ARGS, { stdout: `${ROOT}/.git\n` }),
				step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, {
					code: 1,
					stderr: "Error: unable to open database file\n",
				}),
			],
			{ stack: false },
		);

		expect(pi.execCalls).toEqual(expectedShapeCalls({ forEachRef: false }));
		expect(notifications[0]?.message).toContain(
			`Graphite metadata DB at ${DB_PATH} is missing or unreadable; refusing to land.`,
		);
		pi.assertDone();
	});

	test("uses stack mode instead of fast path when current has descendants", async () => {
		const { pi, notifications, confirmations } = await runLand([], { stack: DB_WITH_DESCENDANT });

		expect(pi.execCalls).toEqual(expectedShapeCalls());
		expect(confirmations).toEqual([
			{
				title: "Land stack?",
				message:
					"Review the landing plan before merging this stack.\n\nImpact\n  • Squash-merge the selected Graphite path from bottom to top.\n  • Refresh remaining upstack PRs after each merge.\n  • Delete landed local Graphite branches once they are safe to remove.\n\nPlan\n  Stack   1 PR\n  Range   feature-branch → feature-branch\n  Target  main\n  Note    child-branch will not be merged; the command will try to maintain them after landing.\n\nPress Enter to proceed, or type n to cancel.",
				options: { defaultAnswer: "yes" },
			},
		]);
		expect(notifications).toEqual([
			{ message: "Cancelled before merge; no PRs were landed.", level: "info" },
		]);
		pi.assertDone();
	});

	test("CLI mode captures non-interactive stack refusals as failures", async () => {
		const pi = new FakePi(graphiteShapeSteps(DB_WITH_DESCENDANT));
		let stdout = "";
		let stderr = "";

		const exitCode = await runLandCli({
			cwd: ROOT,
			rawArgs: "",
			exec: async (command, args, options) =>
				await pi.exec(command, args, {
					...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
					...(options?.timeout === undefined ? {} : { timeout: options.timeout }),
				}),
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
		});

		expect(exitCode).toBe(1);
		expect(stdout).toBe("");
		expect(stderr).toBe(
			"Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.\n",
		);
		pi.assertDone();
	});

	test("CLI mode uses injected confirmation instead of requiring --yes", async () => {
		const pi = new FakePi(graphiteShapeSteps(DB_WITH_DESCENDANT));
		const confirmations: Confirmation[] = [];
		let stdout = "";
		let stderr = "";

		const exitCode = await runLandCli({
			cwd: ROOT,
			rawArgs: "",
			exec: async (command, args, options) =>
				await pi.exec(command, args, {
					...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
					...(options?.timeout === undefined ? {} : { timeout: options.timeout }),
				}),
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
			confirm: (title, message, options) => {
				confirmations.push({ title, message, ...(options === undefined ? {} : { options }) });
				return false;
			},
		});

		expect(exitCode).toBe(0);
		expect(confirmations).toEqual([
			{
				title: "Land stack?",
				message:
					"Review the landing plan before merging this stack.\n\nImpact\n  • Squash-merge the selected Graphite path from bottom to top.\n  • Refresh remaining upstack PRs after each merge.\n  • Delete landed local Graphite branches once they are safe to remove.\n\nPlan\n  Stack   1 PR\n  Range   feature-branch → feature-branch\n  Target  main\n  Note    child-branch will not be merged; the command will try to maintain them after landing.\n\nPress Enter to proceed, or type n to cancel.",
				options: { defaultAnswer: "yes" },
			},
		]);
		expect(stdout).toBe("Cancelled before merge; no PRs were landed.\n");
		expect(stderr).toContain("land: running git rev-parse --show-toplevel...");
		expect(stderr).toContain("land: running gt trunk --no-interactive...");
		pi.assertDone();
	});

	test("supports fast-path dry-run without merging", async () => {
		const { pi, notifications } = await runLand([step("gh", PR_VIEW_ARGS, { stdout: prView() })], {
			args: "--dry-run",
		});

		expect(pi.execCalls).toEqual([
			...expectedShapeCalls(),
			{ command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } },
		]);
		expect(notifications).toEqual([
			{ message: "Dry run only; would merge PR #42 into main.", level: "info" },
		]);
		pi.assertDone();
	});
});

describe("code land CLI house-style result blocks (PR 5b)", () => {
	// PR 5b threads resolved caps to the CLI edge (`LandCliInput.caps`) and routes the settled land
	// result blocks through `renderLandResultBlock`. These assert the house-style surface: a bold
	// intent-painted glyph headline on the settled block (stdout/stderr per routing), full semantic
	// text preserved under `stripAnsi`, refusal rendered warn (never red, house-style §7.3), and the
	// streaming progress on stderr left plain — ANSI is confined to the CLI result blocks and never
	// leaks into the shared Pi command-stream path.
	const TRUECOLOR_CAPS: Caps = {
		isTty: true,
		colorDepth: "truecolor",
		columns: 80,
		canRenderUnicode: true,
	};
	const SUCCESS_TRUECOLOR = "\x1b[38;2;63;185;80m";
	const ERROR_TRUECOLOR = "\x1b[38;2;248;81;73m";

	test("stack success summary renders a green check headline on stdout", async () => {
		const pi = new FakePi([
			...graphiteShapeSteps(DB_WITH_DESCENDANT),
			...successfulStackLandingSteps(),
		]);
		let stdout = "";
		let stderr = "";

		const exitCode = await runLandCli({
			cwd: ROOT,
			rawArgs: "--yes",
			caps: TRUECOLOR_CAPS,
			exec: async (command, args, options) => await pi.exec(command, args, options),
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
		});

		expect(exitCode).toBe(0);
		// Semantic content preserved; headline carries the success glyph.
		expect(stripAnsi(stdout)).toContain("✓ Landed 1 PR: #42 feature-branch.");
		expect(stripAnsi(stdout)).toContain("Remaining cleanup:");
		// Headline is styled with the success swatch; streaming progress on stderr stays plain.
		expect(stdout).toContain(SUCCESS_TRUECOLOR);
		expect(stderr).not.toContain("\x1b");
		expect(stderr).toContain("→ Merging PR #42 feature-branch...");
		pi.assertDone();
	});

	test("non-interactive stack refusal renders a warn headline on stderr, never red", async () => {
		const pi = new FakePi(graphiteShapeSteps(DB_WITH_DESCENDANT));
		let stdout = "";
		let stderr = "";

		const exitCode = await runLandCli({
			cwd: ROOT,
			rawArgs: "",
			caps: TRUECOLOR_CAPS,
			exec: async (command, args, options) => await pi.exec(command, args, options),
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
		});

		expect(exitCode).toBe(1);
		expect(stripAnsi(stderr)).toContain(
			"✗ Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.",
		);
		// Refusal is a first-class warn kind: styled, but never the red error swatch (house-style §7.3).
		expect(stderr).toContain("\x1b");
		expect(stderr).not.toContain(ERROR_TRUECOLOR);
		expect(stdout).toBe("");
		pi.assertDone();
	});

	test("fast-path dry-run renders a green check preview block on stdout", async () => {
		const pi = new FakePi([
			...graphiteShapeSteps(DB_SINGLE_BRANCH),
			step("gh", PR_VIEW_ARGS, { stdout: prView() }),
		]);
		let stdout = "";
		let stderr = "";

		const exitCode = await runLandCli({
			cwd: ROOT,
			rawArgs: "--dry-run",
			caps: TRUECOLOR_CAPS,
			exec: async (command, args, options) => await pi.exec(command, args, options),
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
		});

		expect(exitCode).toBe(0);
		expect(stripAnsi(stdout)).toContain("✓ Dry run only; would merge PR #42 into main.");
		expect(stdout).toContain(SUCCESS_TRUECOLOR);
		expect(stderr).not.toContain("\x1b");
		pi.assertDone();
	});

	test("omitting caps keeps the CLI result block plain (no ANSI)", async () => {
		const pi = new FakePi([
			...graphiteShapeSteps(DB_SINGLE_BRANCH),
			step("gh", PR_VIEW_ARGS, { stdout: prView() }),
		]);
		let stdout = "";
		let stderr = "";

		const exitCode = await runLandCli({
			cwd: ROOT,
			rawArgs: "--dry-run",
			exec: async (command, args, options) => await pi.exec(command, args, options),
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
		});

		expect(exitCode).toBe(0);
		expect(stdout).toContain("Dry run only; would merge PR #42 into main.");
		expect(stdout).not.toContain("\x1b");
		expect(stderr).not.toContain("\x1b");
		pi.assertDone();
	});
});

describe("gh land PR parsing", () => {
	test("accepts a valid PR with null body", () => {
		expect(
			parsePullRequestView({
				number: 7,
				headRefName: "feature",
				baseRefName: TRUNK,
				title: "Title",
				body: null,
				headRefOid: "abc123",
			}),
		).toEqual({
			number: 7,
			headRefName: "feature",
			baseRefName: TRUNK,
			title: "Title",
			body: "",
			headRefOid: "abc123",
		});
	});

	test("treats a missing body as an empty merge body", () => {
		expect(
			parsePullRequestView({
				number: 7,
				headRefName: "feature",
				baseRefName: TRUNK,
				title: "Title",
				headRefOid: "abc123",
			}),
		).toEqual({
			number: 7,
			headRefName: "feature",
			baseRefName: TRUNK,
			title: "Title",
			body: "",
			headRefOid: "abc123",
		});
	});

	test("rejects a non-object top-level value without throwing", () => {
		for (const value of [null, [], "not an object", 42]) {
			expect(parsePullRequestView(value)).toEqual({
				error: "gh pr view did not return a PR object. Merge not attempted.",
			});
		}
	});

	test("reports missing required fields without throwing", () => {
		expect(parsePullRequestView({ number: 7, title: "Title" })).toEqual({
			error:
				"gh pr view did not return required field(s): headRefName, baseRefName, headRefOid. Merge not attempted.",
		});
	});

	test("rejects a non-finite PR number as a missing field", () => {
		expect(
			parsePullRequestView({
				number: Number.NaN,
				headRefName: "feature",
				baseRefName: TRUNK,
				title: "Title",
				headRefOid: "abc123",
			}),
		).toEqual({
			error: "gh pr view did not return required field(s): number. Merge not attempted.",
		});
	});

	test("rejects a present non-string, non-null body", () => {
		expect(
			parsePullRequestView({
				number: 7,
				headRefName: "feature",
				baseRefName: TRUNK,
				title: "Title",
				body: 123,
				headRefOid: "abc123",
			}),
		).toEqual({ error: "gh pr view returned a non-string body. Merge not attempted." });
	});
});
