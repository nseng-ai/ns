import { describe, expect, test } from "bun:test";

import {
	parsePullRequestView,
	registerLandCommand,
	type ExecResult,
	type LandCommandContext,
	type LandExtensionAPI,
	type NotifyLevel,
} from "../src/land.ts";

const ROOT = "/repo";
const PR_VIEW_ARGS = ["pr", "view", "--json", "number,headRefName,baseRefName,title,body,headRefOid"];
const PR_VIEW_TIMEOUT_MS = 30_000;
const PR_MERGE_TIMEOUT_MS = 120_000;

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
	printed: string[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const printed: string[] = [];
	let waits = 0;

	const ctx: LandCommandContext = {
		cwd: options.cwd ?? ROOT,
		...(options.mode === undefined ? {} : { mode: options.mode }),
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
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

	return { ctx, notifications, printed, waitForIdleCalls: () => waits };
}

async function runLand(script: ScriptedExec[], options: { mode?: LandCommandContext["mode"] } = {}): Promise<{
	pi: FakePi;
	notifications: Notification[];
	printed: string[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script);
	registerLandCommand(pi);
	const command = pi.commands.get("code:land");
	expect(command).toBeDefined();
	const context = createContext({ mode: options.mode });
	await command?.handler("", context.ctx);
	return { pi, ...context };
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
		baseRefName: overrides.baseRefName ?? "master",
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
		expect(pi.commands.get("code:land")?.description).toBe("Squash-merge the current branch's GitHub PR into master");
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

		expect(printed).toEqual(["Refusing to land PR #42: base branch is 'develop', not 'master'. Merge not attempted.\n"]);
		pi.assertDone();
	});

	test("passes an empty body when the PR body is null", async () => {
		const { pi } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: prView({ body: null }) }),
			step("gh", expectedMergeArgs({ body: "" })),
		]);

		expect(pi.execCalls[1]?.args).toEqual(expectedMergeArgs({ body: "" }));
		pi.assertDone();
	});

	test("refuses to merge PRs whose base branch is not master", async () => {
		const { pi, notifications } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: prView({ baseRefName: "develop" }) }),
		]);

		expect(pi.execCalls).toEqual([{ command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } }]);
		expect(notifications).toEqual([
			{
				message: "Refusing to land PR #42: base branch is 'develop', not 'master'. Merge not attempted.",
				level: "error",
			},
		]);
		pi.assertDone();
	});

	test("reports gh pr view failures without attempting a merge", async () => {
		const { pi, notifications } = await runLand([
			step("gh", PR_VIEW_ARGS, { code: 1, stderr: "no pull requests found" }),
		]);

		expect(pi.execCalls).toEqual([{ command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } }]);
		expect(notifications).toEqual([{ message: "no pull requests found", level: "error" }]);
		pi.assertDone();
	});

	test("reports malformed gh pr view JSON without attempting a merge", async () => {
		const { pi, notifications } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: "not json" }),
		]);

		expect(pi.execCalls).toEqual([{ command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } }]);
		expect(notifications[0]?.message).toContain("Failed to parse gh pr view output");
		expect(notifications[0]?.message).toContain("Merge not attempted.");
		expect(notifications[0]?.level).toBe("error");
		pi.assertDone();
	});

	test("reports missing gh pr view fields without attempting a merge", async () => {
		const { pi, notifications } = await runLand([
			step("gh", PR_VIEW_ARGS, { stdout: JSON.stringify({ number: 42, title: "Ship feature" }) }),
		]);

		expect(pi.execCalls).toEqual([{ command: "gh", args: PR_VIEW_ARGS, options: { cwd: ROOT, timeout: PR_VIEW_TIMEOUT_MS } }]);
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

		expect(pi.execCalls).toHaveLength(2);
		expect(notifications).toEqual([
			{ message: "Running gh pr merge -s with PR title/body as commit message…", level: "info" },
			{
				message: "merge stdout\nmerge stderr\ngh pr merge -s with PR title/body failed for PR #42 with exit code 1.",
				level: "error",
			},
		]);
		pi.assertDone();
	});
});

describe("gh land PR parsing", () => {
	test("accepts a valid PR with null body", () => {
		expect(
			parsePullRequestView({
				number: 7,
				headRefName: "feature",
				baseRefName: "master",
				title: "Title",
				body: null,
				headRefOid: "abc123",
			}),
		).toEqual({
			number: 7,
			headRefName: "feature",
			baseRefName: "master",
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
				baseRefName: "master",
				title: "Title",
				headRefOid: "abc123",
			}),
		).toEqual({
			number: 7,
			headRefName: "feature",
			baseRefName: "master",
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
				baseRefName: "master",
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
				baseRefName: "master",
				title: "Title",
				body: 123,
				headRefOid: "abc123",
			}),
		).toEqual({ error: "gh pr view returned a non-string body. Merge not attempted." });
	});
});
