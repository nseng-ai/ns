import { describe, expect, test } from "vitest";

import {
	parsePullRequestView,
	registerLandCommand,
	type ExecResult,
	type LandCommandContext,
	type LandExtensionAPI,
	type NotifyLevel,
} from "@asdl/ccc/land";

const ROOT = "/repo";
const CURRENT = "feature-branch";
const TRUNK = "main";
const PR_VIEW_ARGS = ["pr", "view", "--json", "number,headRefName,baseRefName,title,body,headRefOid"];
const PR_VIEW_TIMEOUT_MS = 30_000;
const PR_MERGE_TIMEOUT_MS = 120_000;
const GIT_TIMEOUT_MS = 30_000;
const GT_TIMEOUT_MS = 120_000;
const SQLITE_TIMEOUT_MS = 30_000;
const GIT_ROOT_ARGS = ["rev-parse", "--show-toplevel"];
const GIT_CURRENT_ARGS = ["symbolic-ref", "--short", "HEAD"];
const GT_TRUNK_ARGS = ["trunk", "--no-interactive"];
const GIT_COMMON_DIR_ARGS = ["rev-parse", "--path-format=absolute", "--git-common-dir"];
const DB_PATH = `${ROOT}/.git/.graphite_metadata.db`;
const TOPOLOGY_ARGS = [
	"-readonly",
	"-json",
	DB_PATH,
	"SELECT branch_name, parent_branch_name, children, validation_result FROM branch_metadata",
];

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

const DB_SINGLE_BRANCH = metadataDbJson([
	{ branch: TRUNK, children: [CURRENT], trunk: true },
	{ branch: CURRENT, parent: TRUNK, children: [] },
]);
const DB_WITH_DESCENDANT = metadataDbJson([
	{ branch: TRUNK, children: [CURRENT], trunk: true },
	{ branch: CURRENT, parent: TRUNK, children: ["child-branch"] },
	{ branch: "child-branch", parent: CURRENT, children: [] },
]);

type RegisteredCommand = Parameters<LandExtensionAPI["registerCommand"]>[1];

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

class FakePi implements LandExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[] = []) {
		this.script = [...script];
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (!expected) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
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

function createContext(options: { cwd?: string; mode?: LandCommandContext["mode"] } = {}): {
	ctx: LandCommandContext;
	notifications: Notification[];
	confirmations: Confirmation[];
	printed: string[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const confirmations: Confirmation[] = [];
	const printed: string[] = [];
	let waits = 0;

	const ctx: LandCommandContext = {
		cwd: options.cwd ?? ROOT,
		hasUI: true,
		...(options.mode === undefined ? {} : { mode: options.mode }),
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async confirm(title: string, message: string): Promise<boolean> {
				confirmations.push({ title, message });
				return false;
			},
			setStatus(): void {},
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

	return { ctx, notifications, confirmations, printed, waitForIdleCalls: () => waits };
}

async function runLand(script: ScriptedExec[], options: { mode?: LandCommandContext["mode"]; stack?: string | false; args?: string } = {}): Promise<{
	pi: FakePi;
	notifications: Notification[];
	confirmations: Confirmation[];
	printed: string[];
	waitForIdleCalls: () => number;
}> {
	const fullScript = options.stack === false ? script : [...graphiteShapeSteps(options.stack ?? DB_SINGLE_BRANCH), ...script];
	const pi = new FakePi(fullScript);
	registerLandCommand(pi);
	const command = pi.commands.get("code:land");
	expect(command).toBeDefined();
	const context = createContext({ mode: options.mode });
	await command?.handler(options.args ?? "", context.ctx);
	return { pi, ...context };
}

function graphiteShapeSteps(dbRows: string): ScriptedExec[] {
	return [
		step("git", GIT_ROOT_ARGS, { stdout: `${ROOT}\n` }),
		step("git", GIT_CURRENT_ARGS, { stdout: `${CURRENT}\n` }),
		step("gt", GT_TRUNK_ARGS, { stdout: `${TRUNK}\n` }),
		step("git", GIT_COMMON_DIR_ARGS, { stdout: `${ROOT}/.git\n` }),
		step("sqlite3", TOPOLOGY_ARGS, { stdout: `${dbRows}\n` }),
	];
}

function expectedShapeCalls(): ExecCall[] {
	return [
		{ command: "git", args: GIT_ROOT_ARGS, options: { cwd: ROOT, timeout: GIT_TIMEOUT_MS } },
		{ command: "git", args: GIT_CURRENT_ARGS, options: { cwd: ROOT, timeout: GIT_TIMEOUT_MS } },
		{ command: "gt", args: GT_TRUNK_ARGS, options: { cwd: ROOT, timeout: GT_TIMEOUT_MS } },
		{ command: "git", args: GIT_COMMON_DIR_ARGS, options: { cwd: ROOT, timeout: GIT_TIMEOUT_MS } },
		{ command: "sqlite3", args: TOPOLOGY_ARGS, options: { cwd: ROOT, timeout: SQLITE_TIMEOUT_MS } },
	];
}

function prView(overrides: {
	number?: number;
	headRefName?: string;
	baseRefName?: string;
	title?: string;
	body?: string | null;
	headRefOid?: string;
} = {}): string {
	return JSON.stringify({
		number: overrides.number ?? 42,
		headRefName: overrides.headRefName ?? "feature-branch",
		baseRefName: overrides.baseRefName ?? TRUNK,
		title: overrides.title ?? "Ship feature",
		body: overrides.body === undefined ? "Feature body" : overrides.body,
		headRefOid: overrides.headRefOid ?? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	});
}

function expectedMergeArgs(options: { number?: number; sha?: string; title?: string; body?: string } = {}): string[] {
	return [
		"pr",
		"merge",
		String(options.number ?? 42),
		"-s",
		"--match-head-commit",
		options.sha ?? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"--subject",
		options.title ?? "Ship feature",
		"--body",
		options.body ?? "Feature body",
	];
}

describe("code land command registration", () => {
	test("registers only the namespaced code:land command", () => {
		const pi = new FakePi();
		registerLandCommand(pi);

		expect([...pi.commands.keys()]).toEqual(["code:land"]);
		expect(pi.commands.has("gh:land")).toBe(false);
		expect(pi.commands.has("land")).toBe(false);
		const command = pi.commands.get("code:land");
		expect(command?.description).toBe("Land the current PR or Graphite stack into trunk");
		expect(command?.getArgumentCompletions?.("--")).toEqual([
			{ value: "--yes", label: "--yes" },
			{ value: "--dry-run", label: "--dry-run" },
			{ value: "--help", label: "--help" },
		]);
	});
});

describe("code land command", () => {
	test("squash-merges the current PR with the PR title and body", async () => {
		const { pi, notifications, waitForIdleCalls } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: prView() }),
			step("gh", expectedMergeArgs(), { stdout: "Merged pull request #42" }),
		]);

		expect(waitForIdleCalls()).toBe(1);
		expect(pi.execCalls).toEqual([
			...expectedShapeCalls(),
			{ command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } },
			{ command: "gh", args: expectedMergeArgs(), options: { cwd: ROOT, timeout: PR_MERGE_TIMEOUT_MS } },
		]);
		expect(notifications).toEqual([
			{ message: "Running gh pr merge -s with PR title/body as commit message…", level: "info" },
			{
				message: "Merged pull request #42\nMerged PR #42; squash commit used PR title/body.",
				level: "info",
			},
		]);
		pi.assertDone();
	});

	test("prints command results in print mode", async () => {
		const { pi, notifications, printed } = await runLand(
			[
				step("gh", PR_VIEW_ARGS, { stdout: prView() }),
				step("gh", expectedMergeArgs(), { stdout: "Merged pull request #42" }),
			],
			{ mode: "print" },
		);

		expect(printed).toEqual([
			"Running gh pr merge -s with PR title/body as commit message…\n",
			"Merged pull request #42\nMerged PR #42; squash commit used PR title/body.\n",
		]);
		expect(notifications).toEqual([
			{ message: "Running gh pr merge -s with PR title/body as commit message…", level: "info" },
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

		expect(printed).toEqual(["Refusing to land PR #42: base branch is 'develop', not Graphite trunk 'main'. Merge not attempted.\n"]);
		pi.assertDone();
	});

	test("passes an empty body when the PR body is null", async () => {
		const { pi } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: prView({ body: null }) }),
			step("gh", expectedMergeArgs({ body: "" })),
		]);

		expect(pi.execCalls.at(-1)?.args).toEqual(expectedMergeArgs({ body: "" }));
		pi.assertDone();
	});

	test("refuses to merge PRs whose base branch is not Graphite trunk", async () => {
		const { pi, notifications } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: prView({ baseRefName: "develop" }) }),
		]);

		expect(pi.execCalls).toEqual([...expectedShapeCalls(), { command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } }]);
		expect(notifications).toEqual([
			{
				message: "Refusing to land PR #42: base branch is 'develop', not Graphite trunk 'main'. Merge not attempted.",
				level: "error",
			},
		]);
		pi.assertDone();
	});

	test("reports gh pr view failures without attempting a merge", async () => {
		const { pi, notifications } = await runLand([
			step("gh", PR_VIEW_ARGS, { code: 1, stderr: "no pull requests found" }),
		]);

		expect(pi.execCalls).toEqual([...expectedShapeCalls(), { command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } }]);
		expect(notifications).toEqual([{ message: "no pull requests found", level: "error" }]);
		pi.assertDone();
	});

	test("reports malformed gh pr view JSON without attempting a merge", async () => {
		const { pi, notifications } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: "not json" }),
		]);

		expect(pi.execCalls).toEqual([...expectedShapeCalls(), { command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } }]);
		expect(notifications[0]?.message).toContain("Failed to parse gh pr view output");
		expect(notifications[0]?.message).toContain("Merge not attempted.");
		expect(notifications[0]?.level).toBe("error");
		pi.assertDone();
	});

	test("reports missing gh pr view fields without attempting a merge", async () => {
		const { pi, notifications } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: JSON.stringify({ number: 42, title: "Ship feature" }) }),
		]);

		expect(pi.execCalls).toEqual([...expectedShapeCalls(), { command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } }]);
		expect(notifications).toEqual([
			{
				message: "gh pr view did not return required field(s): headRefName, baseRefName, headRefOid. Merge not attempted.",
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

		expect(pi.execCalls).toHaveLength(7);
		expect(notifications).toEqual([
			{ message: "Running gh pr merge -s with PR title/body as commit message…", level: "info" },
			{
				message: "merge stdout\nmerge stderr\ngh pr merge -s with PR title/body failed for PR #42 with exit code 1.",
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
				step("sqlite3", TOPOLOGY_ARGS, { code: 1, stderr: "Error: unable to open database file\n" }),
			],
			{ stack: false },
		);

		expect(pi.execCalls).toEqual(expectedShapeCalls());
		expect(notifications[0]?.message).toContain(`Graphite metadata DB at ${DB_PATH} is missing or unreadable; refusing to land.`);
		pi.assertDone();
	});

	test("uses stack mode instead of fast path when current has descendants", async () => {
		const { pi, notifications, confirmations } = await runLand([], { stack: DB_WITH_DESCENDANT });

		expect(pi.execCalls).toEqual(expectedShapeCalls());
		expect(confirmations).toEqual([
			{
				title: "Land stack?",
				message:
					"Land 1 PRs from feature-branch through feature-branch into main?\nDescendants above feature-branch will not be merged; this command will try to maintain them after landing.",
			},
		]);
		expect(notifications).toEqual([{ message: "Cancelled before merge; no PRs were landed.", level: "info" }]);
		pi.assertDone();
	});

	test("supports fast-path dry-run without merging", async () => {
		const { pi, notifications } = await runLand([step("gh", PR_VIEW_ARGS, { stdout: prView() })], { args: "--dry-run" });

		expect(pi.execCalls).toEqual([...expectedShapeCalls(), { command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } }]);
		expect(notifications).toEqual([{ message: "Dry run only; would merge PR #42 into main.", level: "info" }]);
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
			error: "gh pr view did not return required field(s): headRefName, baseRefName, headRefOid. Merge not attempted.",
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
		).toEqual({ error: "gh pr view did not return required field(s): number. Merge not attempted." });
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
