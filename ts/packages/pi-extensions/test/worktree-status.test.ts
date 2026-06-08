import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { stripTerminalEscapes } from "../src/command-runtime.ts";
import worktreeStatusExtension, {
	formatGtStatus,
	loadGtStatus,
	loadWorktreeStatus,
	renderWorktreeStatusMessage,
	type ExecResult,
	type ExtensionAPI,
	type ExtensionContext,
	type StatusTheme,
} from "../src/worktree-status.ts";

const ROOT = "/repo";

interface ExecCall {
	command: string;
	args: string[];
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
}

class FakePi {
	readonly calls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[]) {
		this.script = [...script];
	}

	async exec(command: string, args: string[]): Promise<ExecResult> {
		this.calls.push({ command, args: [...args] });
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

class OrderlessFakePi {
	readonly calls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[]) {
		this.script = [...script];
	}

	async exec(command: string, args: string[]): Promise<ExecResult> {
		this.calls.push({ command, args: [...args] });
		const index = this.script.findIndex((expected) => expected.command === command && sameArgs(expected.args, args));
		if (index === -1) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		const [expected] = this.script.splice(index, 1);
		return execResult(expected?.result);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

type RegisteredEventName = "session_start" | "tool_result" | "agent_end" | "session_shutdown";
type SessionStartHandler = (event: unknown, ctx: ExtensionContext) => Promise<void> | void;
type SessionShutdownHandler = () => Promise<void> | void;

class RegistrationFakePi {
	readonly commands: string[] = [];
	readonly events: RegisteredEventName[] = [];
	readonly renderers: string[] = [];

	registerCommand(name: string): void {
		this.commands.push(name);
	}

	on(event: RegisteredEventName): void {
		this.events.push(event);
	}

	async exec(): Promise<ExecResult> {
		return execResult({ code: 99 });
	}

	registerMessageRenderer(customType: string): void {
		this.renderers.push(customType);
	}
}

class LifecycleFakePi extends OrderlessFakePi {
	sessionStart: SessionStartHandler | undefined;
	sessionShutdown: SessionShutdownHandler | undefined;

	on(event: RegisteredEventName, handler: unknown): void {
		if (event === "session_start") this.sessionStart = handler as SessionStartHandler;
		if (event === "session_shutdown") this.sessionShutdown = handler as SessionShutdownHandler;
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

function revListStep(base: string, count: number): ScriptedExec {
	return step("git", ["rev-list", "--count", `${base}..HEAD`], { stdout: `${count}\n` });
}

function dirtyStep(stdout = ""): ScriptedExec {
	return step("git", ["status", "--porcelain=v1"], { stdout });
}

function previousCheckoutStep(branch: string): ScriptedExec {
	return step("git", ["rev-parse", "--symbolic-full-name", "@{-1}"], { stdout: `refs/heads/${branch}\n` });
}

function verifyRefStep(branch: string): ScriptedExec {
	return step("git", ["show-ref", "--verify", `refs/heads/${branch}`]);
}

async function loadFormattedStatus(script: ScriptedExec[], root: string): Promise<{ pi: FakePi; formatted: string }> {
	const pi = new FakePi(script);
	const status = await loadGtStatus(pi, root);
	return { pi, formatted: formatGtStatus(status) };
}

interface MetadataBranchRow {
	branchName: string;
	parentBranchName?: string;
	children?: readonly string[];
	validationResult?: string;
	rawChildren?: string | null;
}

function writeGraphiteMetadataDb(gitDir: string, rows: readonly MetadataBranchRow[]): void {
	const db = new Database(join(gitDir, ".graphite_metadata.db"));
	try {
		db.run(`
			CREATE TABLE branch_metadata (
				branch_name TEXT PRIMARY KEY,
				parent_branch_name TEXT,
				children TEXT,
				validation_result TEXT,
				extra_graphite_column TEXT
			)
		`);
		const insert = db.prepare<unknown, [string, string | null, string | null, string | null, null]>(
			"INSERT INTO branch_metadata (branch_name, parent_branch_name, children, validation_result, extra_graphite_column) VALUES (?, ?, ?, ?, ?)",
		);
		for (const row of rows) {
			const children = row.rawChildren !== undefined ? row.rawChildren : JSON.stringify(row.children ?? []);
			insert.run(row.branchName, row.parentBranchName ?? null, children, row.validationResult ?? null, null);
		}
	} finally {
		db.close();
	}
}

function standardGraphiteRows(): MetadataBranchRow[] {
	return [
		{ branchName: "main", children: ["feature/current"], validationResult: "TRUNK" },
		{ branchName: "feature/current", parentBranchName: "main" },
	];
}

function makeGitRepo(branch: string): string {
	const root = mkdtempSync(join(tmpdir(), "worktree-status-"));
	const gitDir = join(root, ".git");
	mkdirSync(gitDir);
	writeFileSync(join(gitDir, "HEAD"), `ref: refs/heads/${branch}\n`);
	return root;
}

function makeGraphiteRepo(branch = "feature/current", rows: readonly MetadataBranchRow[] = standardGraphiteRows()): string {
	const root = makeGitRepo(branch);
	writeGraphiteMetadataDb(join(root, ".git"), rows);
	return root;
}

function makePyprojectRoot(): string {
	const root = makeGraphiteRepo();
	writeFileSync(join(root, "pyproject.toml"), "[project]\nname = \"example\"\n", "utf8");
	return root;
}

function basicGitStatusScript(base = "main", count = 1, dirtyStdout = ""): ScriptedExec[] {
	return [revListStep(base, count), dirtyStep(dirtyStdout)];
}

function expectNoGtCalls(pi: { calls: readonly ExecCall[] }): void {
	expect(pi.calls.filter((call) => call.command === "gt")).toEqual([]);
}

function brmemListStep(result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["list", "--format", "json"], result);
}

function uvBrmemListStep(projectRoot: string, result: Partial<ExecResult>): ScriptedExec {
	return step("uv", ["run", "--directory", projectRoot, "brmem", "list", "--format", "json"], result);
}

const TEST_THEME: StatusTheme = {
	fg(color, value) {
		const code = color === "accent" ? "36" : "90";
		return `\x1B[${code}m${value}\x1B[39m`;
	},
	underline(value) {
		return `\x1B[4m${value}\x1B[24m`;
	},
};

describe("worktree status extension registration", () => {
	test("registers automatic status hooks without visible slash commands", () => {
		const pi = new RegistrationFakePi();
		worktreeStatusExtension(pi as ExtensionAPI);

		expect(pi.commands).toEqual([]);
		expect(pi.renderers).toEqual(["worktree-status"]);
		expect(pi.events).toEqual(["session_start", "tool_result", "agent_end", "session_shutdown"]);
	});

	test("sets brmem and gt footer status on separate lines", async () => {
		const root = makeGraphiteRepo();
		try {
			const pi = new LifecycleFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: {
							entries: [{ namespace: "planned-branch", key: "model-only-checkpoint-message-text-generation.md" }],
						},
					}),
				}),
				...basicGitStatusScript(),
			]);
			const statuses = new Map<string, string | undefined>();
			const ctx: ExtensionContext = {
				cwd: root,
				hasUI: true,
				ui: {
					theme: TEST_THEME,
					setStatus(key, value) {
						statuses.set(key, value);
					},
					setWidget() {},
				},
			};

			worktreeStatusExtension(pi as ExtensionAPI);
			await pi.sessionStart?.({}, ctx);

			pi.assertDone();
			expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
				"[brmem] (planned-branch: model-only-checkpoint-message-text-generation.md)\n[gt] (↓: main) (↑: -) (commits)",
			);
			await pi.sessionShutdown?.();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("renders singular handoff footer scope before rendering gt on the next line", async () => {
		const root = makeGraphiteRepo();
		try {
			const pi = new LifecycleFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: {
							entries: [
								{ namespace: "handoff", key: "document-local-github-pull-guidance.md" },
								{ namespace: "handoff", key: "routing-docs-close-objective.md" },
								{ namespace: "session-artifacts", key: "handoffs/resume-resource-audit-session.md" },
							],
						},
					}),
				}),
				...basicGitStatusScript(),
			]);
			const statuses = new Map<string, string | undefined>();
			const ctx: ExtensionContext = {
				cwd: root,
				hasUI: true,
				ui: {
					theme: TEST_THEME,
					setStatus(key, value) {
						statuses.set(key, value);
					},
					setWidget() {},
				},
			};

			worktreeStatusExtension(pi as ExtensionAPI);
			await pi.sessionStart?.({}, ctx);

			pi.assertDone();
			expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
				"[brmem] (handoff: document-local-github-pull-guidance.md, routing-docs-close-objective.md) (session-artifacts: handoffs)\n[gt] (↓: main) (↑: -) (commits)",
			);
			await pi.sessionShutdown?.();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("custom footer reads cwd branch from worktree instead of stale footer data", async () => {
		const root = makeGraphiteRepo("current-branch", [
			{ branchName: "main", children: ["current-branch"], validationResult: "TRUNK" },
			{ branchName: "current-branch", parentBranchName: "main" },
		]);
		try {
			const pi = new LifecycleFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: { entries: [] },
					}),
				}),
				...basicGitStatusScript(),
			]);
			const statuses = new Map<string, string>();
			let footerFactory: Parameters<NonNullable<ExtensionContext["ui"]["setFooter"]>>[0];
			const ctx: ExtensionContext = {
				cwd: root,
				hasUI: true,
				sessionManager: {
					getEntries() {
						return [];
					},
					getCwd() {
						return root;
					},
					getSessionName() {
						return undefined;
					},
				},
				modelRegistry: {
					isUsingOAuth() {
						return false;
					},
				},
				model: { id: "test-model", contextWindow: 272000 },
				getContextUsage() {
					return { contextWindow: 272000, percent: 18.2 };
				},
				ui: {
					theme: TEST_THEME,
					setStatus(key, value) {
						if (value === undefined) statuses.delete(key);
						else statuses.set(key, value);
					},
					setWidget() {},
					setFooter(factory) {
						footerFactory = factory;
					},
				},
			};

			worktreeStatusExtension(pi as ExtensionAPI);
			await pi.sessionStart?.({}, ctx);

			pi.assertDone();
			expect(footerFactory).toBeDefined();
			if (footerFactory === undefined) throw new Error("expected custom footer factory");

			const footer = footerFactory(
				{ requestRender() {} },
				TEST_THEME,
				{
					getGitBranch() {
						return "stale-branch";
					},
					getExtensionStatuses() {
						return statuses;
					},
					getAvailableProviderCount() {
						return 1;
					},
					onBranchChange() {
						return () => {};
					},
				},
			);

			const footerLines = footer.render(200).map(stripTerminalEscapes);
			expect(footerLines[0]).toBe(`${root} (current-branch)`);
			expect(footerLines[0]).not.toContain("stale-branch");
			await pi.sessionShutdown?.();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("custom footer renders multiline worktree status as separate footer lines", async () => {
		const root = makeGraphiteRepo();
		try {
			const pi = new LifecycleFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: {
							entries: [{ namespace: "pb-plan", key: "handoffs-graphite-footer-lines.md" }],
						},
					}),
				}),
				...basicGitStatusScript(),
			]);
			const statuses = new Map<string, string>();
			let footerFactory: Parameters<NonNullable<ExtensionContext["ui"]["setFooter"]>>[0];
			const ctx: ExtensionContext = {
				cwd: root,
				hasUI: true,
				sessionManager: {
					getEntries() {
						return [];
					},
					getCwd() {
						return root;
					},
					getSessionName() {
						return undefined;
					},
				},
				modelRegistry: {
					isUsingOAuth() {
						return false;
					},
				},
				model: { id: "test-model", contextWindow: 272000 },
				getContextUsage() {
					return { contextWindow: 272000, percent: 18.2 };
				},
				ui: {
					theme: TEST_THEME,
					setStatus(key, value) {
						if (value === undefined) statuses.delete(key);
						else statuses.set(key, value);
					},
					setWidget() {},
					setFooter(factory) {
						footerFactory = factory;
					},
				},
			};

			worktreeStatusExtension(pi as ExtensionAPI);
			await pi.sessionStart?.({}, ctx);

			pi.assertDone();
			expect(footerFactory).toBeDefined();
			if (footerFactory === undefined) throw new Error("expected custom footer factory");

			const footer = footerFactory(
				{ requestRender() {} },
				TEST_THEME,
				{
					getGitBranch() {
						return "handoffs-graphite-footer-lines";
					},
					getExtensionStatuses() {
						return statuses;
					},
					getAvailableProviderCount() {
						return 1;
					},
					onBranchChange() {
						return () => {};
					},
				},
			);

			const footerLines = footer.render(200).map(stripTerminalEscapes);
			expect(footerLines.slice(-2)).toEqual([
				"[brmem] (pb-plan: handoffs-graphite-footer-lines.md)",
				"[gt] (↓: main) (↑: -) (commits)",
			]);
			await pi.sessionShutdown?.();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("worktree status message rendering", () => {
	test("renders PR references from message details as terminal hyperlinks", () => {
		const component = renderWorktreeStatusMessage(
			{
				customType: "worktree-status",
				content: "[gt] (pr: #489) (↓: main) (↑: -) (commits)",
				display: true,
				details: { prLinks: [{ number: 489, url: "https://app.graphite.com/github/pr/dagster-io/asdl-tools/489" }] },
			},
			{ expanded: false },
			{ fg: (_color, text) => text },
		);

		expect(component.render(200)).toEqual([
			"[gt] (pr: \x1B]8;;https://app.graphite.com/github/pr/dagster-io/asdl-tools/489\x07#489\x1B]8;;\x07) (↓: main) (↑: -) (commits)",
		]);
	});

	test("ignores unsafe PR link details while rendering", () => {
		const component = renderWorktreeStatusMessage(
			{
				customType: "worktree-status",
				content: "[gt] (pr: #489) (↓: main) (↑: -) (commits)",
				display: true,
				details: { prLinks: [{ number: 489, url: "javascript:alert(1)" }] },
			},
			{ expanded: false },
			{ fg: (_color, text) => text },
		);

		expect(component.render(200)).toEqual(["[gt] (pr: #489) (↓: main) (↑: -) (commits)"]);
	});
});

describe("worktree status formatting", () => {
	test("formats the empty branch icon for zero branch-local commits", () => {
		expect(formatGtStatus({ down: "main", up: "-", commits: "no", dirty: "no" })).toBe("[gt] (↓: main) (↑: -) ∅");
	});

	test("formats commits, unknown commits, and dirty state", () => {
		expect(formatGtStatus({ down: "main", up: "-", commits: "yes", dirty: "no" })).toBe(
			"[gt] (↓: main) (↑: -) (commits)",
		);
		expect(formatGtStatus({ down: "main", up: "-", commits: "?", dirty: "no" })).toBe(
			"[gt] (↓: main) (↑: -) (commits: ?)",
		);
		expect(formatGtStatus({ down: "main", up: "-", commits: "no", dirty: "yes" })).toBe(
			"[gt] (↓: main) (↑: -) ∅ (x)",
		);
	});

	test("omits downstack and commit marker when no downstack branch applies", () => {
		expect(formatGtStatus({ down: undefined, up: "<multiple>", commits: "n/a", dirty: "no" })).toBe(
			"[gt] (↑: <multiple>)",
		);
	});

	test("formats associated PR status as a labeled terminal hyperlink", () => {
		const formatted = formatGtStatus({
			down: "main",
			up: "-",
			commits: "yes",
			dirty: "no",
			pr: { number: 488, url: "https://app.graphite.com/github/pr/dagster-io/asdl-tools/488" },
		});

		expect(formatted).toBe(
			"\x1B]8;;https://app.graphite.com/github/pr/dagster-io/asdl-tools/488\x07[gt] (pr: #488) (↓: main) (↑: -) (commits)\x1B]8;;\x07",
		);
		expect(stripTerminalEscapes(formatted)).toBe("[gt] (pr: #488) (↓: main) (↑: -) (commits)");
	});

	test("colorizes the linked PR number when formatting for the UI", () => {
		const formatted = formatGtStatus(
			{
				down: "main",
				up: "-",
				commits: "yes",
				dirty: "no",
				pr: { number: 488, url: "https://app.graphite.com/github/pr/dagster-io/asdl-tools/488" },
			},
			TEST_THEME,
		);

		expect(formatted).toContain("\x1B[36m\x1B[4m#488\x1B[24m\x1B[39m");
		expect(formatted).toContain("\x1B[90m[gt]\x1B[39m");
		expect(stripTerminalEscapes(formatted)).toBe("[gt] (pr: #488) (↓: main) (↑: -) (commits)");
	});
});

describe("loadWorktreeStatus", () => {
	test("returns unavailable brmem status without throwing when the CLI is unavailable", async () => {
		const root = makeGraphiteRepo();
		try {
			const pi = new OrderlessFakePi([
				brmemListStep({ code: 127, stderr: "brmem: command not found" }),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("unavailable");
			expect(status.gt).toEqual({ down: "main", up: "-", commits: "yes", dirty: "no" });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses a later brmem candidate after an earlier candidate is unavailable", async () => {
		const root = makePyprojectRoot();
		try {
			const pi = new OrderlessFakePi([
				brmemListStep({ code: 127, stderr: "brmem: command not found" }),
				uvBrmemListStep(root, {
					stdout: JSON.stringify({
						exit_code: 0,
						data: { entries: [{ namespace: "plans", key: "adapter/details.md" }] },
					}),
				}),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("(plans: adapter)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("formats base namespace brmem entries from canonical namespace strings", async () => {
		const root = makeGraphiteRepo();
		try {
			const pi = new OrderlessFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: {
							entries: [
								{ namespace: "base", key: "scratch/plan.md" },
								{ namespace: "plans", key: "adapter/details.md" },
							],
						},
					}),
				}),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("(base: scratch) (plans: adapter)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("does not normalize legacy handoffs or session-artifact handoff paths", async () => {
		const root = makeGraphiteRepo();
		try {
			const pi = new OrderlessFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: {
							entries: [
								{ namespace: "handoff", key: "resume-resource-audit-session.md" },
								{ namespace: "handoffs", key: "resume-resource-audit-session.md" },
								{ namespace: "session-artifacts", key: "handoffs/resume-resource-audit-session.md" },
								{ namespace: "session-artifacts", key: "logs/run-123.md" },
								{ namespace: "objectives-archive", key: "closed/objective.md" },
							],
						},
					}),
				}),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe(
				"(handoff: resume-resource-audit-session.md) (handoffs: resume-resource-audit-session.md) (session-artifacts: handoffs, logs)",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses a later brmem candidate after an earlier candidate returns a nonzero envelope", async () => {
		const root = makePyprojectRoot();
		try {
			const pi = new OrderlessFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 2, message: "candidate failed", data: {} }) }),
				uvBrmemListStep(root, {
					stdout: JSON.stringify({
						exit_code: 0,
						data: { entries: [{ namespace: "plans", key: "fallback/details.md" }] },
					}),
				}),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("(plans: fallback)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("degrades malformed brmem JSON output nonfatally", async () => {
		const root = makeGraphiteRepo();
		try {
			const pi = new OrderlessFakePi([brmemListStep({ stdout: "not json" }), ...basicGitStatusScript()]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("unavailable");
			expect(status.gt.down).toBe("main");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("ignores malformed brmem entries while formatting valid ones", async () => {
		const root = makeGraphiteRepo();
		try {
			const pi = new OrderlessFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: {
							entries: [
								{ namespace: "plans", key: "adapter/details.md" },
								{ namespace: 123, key: "bad" },
								{ namespace: "bad" },
								null,
								"not an object",
							],
						},
					}),
				}),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("(plans: adapter)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("treats a non-array brmem entries field as no scopes without throwing", async () => {
		const root = makeGraphiteRepo();
		try {
			const pi = new OrderlessFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: "nope" } }) }),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBeUndefined();
			expect(status.gt.down).toBe("main");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("loadGtStatus", () => {
	test("uses Graphite metadata parent and shows the empty icon for zero commits", async () => {
		const root = makeGraphiteRepo();
		try {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 0), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) ∅");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses Graphite metadata parent and shows commits when branch-local commits exist", async () => {
		const root = makeGraphiteRepo();
		try {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 2), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) (commits)");
			expect(formatted).not.toContain("∅");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("falls back to the previously checked-out local branch when metadata DB is missing", async () => {
		const root = makeGitRepo("feature/current");
		try {
			const { pi, formatted } = await loadFormattedStatus(
				[previousCheckoutStep("main"), verifyRefStep("main"), revListStep("main", 0), dirtyStep()],
				root,
			);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) ∅");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports unknown commits rather than a false empty branch when no base is found", async () => {
		const root = makeGitRepo("feature/current");
		try {
			const { pi, formatted } = await loadFormattedStatus(
				[
					step("git", ["rev-parse", "--symbolic-full-name", "@{-1}"], { code: 1, stderr: "no previous checkout" }),
					dirtyStep(),
				],
				root,
			);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: -) (↑: -) (commits: ?)");
			expect(formatted).not.toContain("∅");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("omits downstack and skips previous-checkout fallback on Graphite trunk", async () => {
		const root = makeGraphiteRepo("master", [
			{ branchName: "master", children: ["feature/one", "feature/two"], validationResult: "TRUNK" },
			{ branchName: "feature/one", parentBranchName: "master" },
			{ branchName: "feature/two", parentBranchName: "master" },
		]);

		try {
			const { pi, formatted } = await loadFormattedStatus([dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↑: <multiple>)");
			expect(formatted).not.toContain("(↓:");
			expect(formatted).not.toContain("commits");
			expect(formatted).not.toContain("∅");
			expect(pi.calls).not.toContainEqual({ command: "git", args: ["rev-parse", "--symbolic-full-name", "@{-1}"] });
			expect(pi.calls.some((call) => call.command === "git" && call.args[0] === "rev-list")).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("falls back safely when metadata schema is missing required columns", async () => {
		const root = makeGitRepo("feature/current");
		const db = new Database(join(root, ".git", ".graphite_metadata.db"));
		try {
			db.run("CREATE TABLE branch_metadata (branch_name TEXT PRIMARY KEY, parent_branch_name TEXT)");
		} finally {
			db.close();
		}

		try {
			const { pi, formatted } = await loadFormattedStatus(
				[previousCheckoutStep("main"), verifyRefStep("main"), revListStep("main", 0), dirtyStep()],
				root,
			);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) ∅");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("treats malformed children JSON as no upstack children", async () => {
		const root = makeGraphiteRepo("feature/current", [
			{ branchName: "main", children: ["feature/current"], validationResult: "TRUNK" },
			{ branchName: "feature/current", parentBranchName: "main", rawChildren: "not json" },
		]);
		try {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 1), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) (commits)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("formats multiple metadata children as multiple upstack branches", async () => {
		const root = makeGraphiteRepo("feature/current", [
			{ branchName: "main", children: ["feature/current"], validationResult: "TRUNK" },
			{ branchName: "feature/current", parentBranchName: "main", children: ["feature/one", "feature/two"] },
			{ branchName: "feature/one", parentBranchName: "feature/current" },
			{ branchName: "feature/two", parentBranchName: "feature/current" },
		]);
		try {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 1), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: <multiple>) (commits)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses previous-checkout fallback when current branch is untracked by metadata", async () => {
		const root = makeGraphiteRepo("feature/current", [
			{ branchName: "main", validationResult: "TRUNK" },
			{ branchName: "feature/other", parentBranchName: "main" },
		]);
		try {
			const { pi, formatted } = await loadFormattedStatus(
				[previousCheckoutStep("main"), verifyRefStep("main"), revListStep("main", 0), dirtyStep()],
				root,
			);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) ∅");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reads metadata from a linked worktree common git dir", async () => {
		const root = mkdtempSync(join(tmpdir(), "worktree-status-"));
		const commonGitDir = join(root, "common.git");
		const worktreeGitDir = join(root, "worktrees", "feature-current");
		mkdirSync(commonGitDir, { recursive: true });
		mkdirSync(worktreeGitDir, { recursive: true });
		writeFileSync(join(root, ".git"), `gitdir: ${worktreeGitDir}\n`);
		writeFileSync(join(worktreeGitDir, "HEAD"), "ref: refs/heads/feature/current\n");
		writeFileSync(join(worktreeGitDir, "commondir"), `${commonGitDir}\n`);
		writeGraphiteMetadataDb(commonGitDir, standardGraphiteRows());

		try {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 1), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) (commits)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("combines dirty state with empty state", async () => {
		const root = makeGraphiteRepo();
		try {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 0), dirtyStep(" M file.txt\n")], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) ∅ (x)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("does not load passive PR status from gt branch info", async () => {
		const root = makeGraphiteRepo();
		try {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 1), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) (commits)");
			expect(formatted).not.toContain("pr:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
