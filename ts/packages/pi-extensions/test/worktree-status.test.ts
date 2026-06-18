import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { describe, expect, test, vi } from "vitest";

import { visibleWidth } from "@earendil-works/pi-tui";

import { stripTerminalEscapes } from "@asdl/core/exec";
import { githubWorktreePrStatusQuery } from "@asdl/core/github-status";
import { makeGraphiteRepo, withTempRoot } from "./worktree-status-fixtures.ts";
import worktreeStatusExtension, {
	type ExtensionAPI,
	type ExtensionContext,
} from "../src/worktree-status.ts";
import type { ExecResult, StatusTheme } from "@asdl/ccc/worktree-status";

interface ExecCall {
	command: string;
	args: string[];
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | Promise<Partial<ExecResult>> | undefined;
	onCall?: (() => void) | undefined;
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
		const result = execResult(await expected?.result);
		expected?.onCall?.();
		return result;
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

type RegisteredEventName = "session_start" | "tool_result" | "agent_end" | "session_shutdown";
type SessionStartHandler = (event: unknown, ctx: ExtensionContext) => Promise<void> | void;
type ToolResultHandler = (event: { toolName: string }) => Promise<void> | void;
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
	toolResult: ToolResultHandler | undefined;
	agentEnd: SessionShutdownHandler | undefined;
	sessionShutdown: SessionShutdownHandler | undefined;

	on(event: RegisteredEventName, handler: unknown): void {
		if (event === "session_start") this.sessionStart = handler as SessionStartHandler;
		if (event === "tool_result") this.toolResult = handler as ToolResultHandler;
		if (event === "agent_end") this.agentEnd = handler as SessionShutdownHandler;
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

function step(command: string, args: string[], result?: Partial<ExecResult> | Promise<Partial<ExecResult>>): ScriptedExec {
	return { command, args, result };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
	let resolvePromise: ((value: T) => void) | undefined;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	return {
		promise,
		resolve(value) {
			if (resolvePromise === undefined) throw new Error("deferred promise was not initialized");
			resolvePromise(value);
		},
	};
}

function revListStep(base: string, count: number): ScriptedExec {
	return step("git", ["rev-list", "--count", `${base}..HEAD`], { stdout: `${count}\n` });
}

function dirtyStep(stdout = ""): ScriptedExec {
	return step("git", ["status", "--porcelain=v1"], { stdout });
}

function headOidStep(oid = "abc123"): ScriptedExec {
	return step("git", ["rev-parse", "--verify", "HEAD"], { stdout: `${oid}\n` });
}

function remoteOriginStep(url = "git@github.com:dagster-io/asdl-tools.git"): ScriptedExec {
	return step("git", ["config", "--get", "remote.origin.url"], { stdout: `${url}\n` });
}

function basicGitStatusScript(base = "main", count = 1, dirtyStdout = "", oid = "abc123"): ScriptedExec[] {
	return [revListStep(base, count), dirtyStep(dirtyStdout), headOidStep(oid)];
}

function brmemListStep(result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["list", "--format", "json"], result);
}

function ghNoPrSteps(headRefName = "feature/current"): ScriptedExec[] {
	return [
		remoteOriginStep(),
		step(
			"gh",
			[
				"api",
				"graphql",
				"-f",
				`query=${githubWorktreePrStatusQuery}`,
				"-f",
				"owner=dagster-io",
				"-f",
				"repo=asdl-tools",
				"-f",
				`headRefName=${headRefName}`,
			],
			{ stdout: JSON.stringify({ data: { repository: { pullRequests: { nodes: [] } } } }) },
		),
	];
}

async function flushPromises(): Promise<void> {
	for (let index = 0; index < 10; index++) await Promise.resolve();
}

const TEST_THEME: StatusTheme = {
	fg(color, value) {
		const code = color === "accent" ? "36" : color === "error" ? "31" : "90";
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
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new LifecycleFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: {
							entries: [{ namespace: "branch-context", key: "model-only-checkpoint-message-text-generation.md" }],
						},
					}),
				}),
				...ghNoPrSteps(),
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
				"[brmem] (branch-context: model-only-checkpoint-message-text-generation.md)\n[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
			);
			await pi.sessionShutdown?.();
		});
	});

	test("renders singular handoff footer scope before rendering gt on the next line", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
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
				...ghNoPrSteps(),
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
				"[brmem] (handoff: document-local-github-pull-guidance.md, routing-docs-close-objective.md) (session-artifacts: handoffs)\n[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
			);
			await pi.sessionShutdown?.();
		});
	});

	test("paints local status before slow gh status resolves", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const ghResult = deferred<Partial<ExecResult>>();
			const localDirtyChecked = deferred<void>();
			const pi = new LifecycleFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				revListStep("main", 1),
				{ ...dirtyStep(), onCall: () => localDirtyChecked.resolve() },
				headOidStep(),
				remoteOriginStep(),
				step(
					"gh",
					[
						"api",
						"graphql",
						"-f",
						`query=${githubWorktreePrStatusQuery}`,
						"-f",
						"owner=dagster-io",
						"-f",
						"repo=asdl-tools",
						"-f",
						"headRefName=feature/current",
					],
					ghResult.promise,
				),
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
			const sessionStart = pi.sessionStart?.({}, ctx);
			await localDirtyChecked.promise;
			await flushPromises();

			const earlyStatus = stripTerminalEscapes(statuses.get("worktree-status") ?? "");

			ghResult.resolve({ stdout: JSON.stringify({ data: { repository: { pullRequests: { nodes: [] } } } }) });
			await sessionStart;
			pi.assertDone();
			await pi.sessionShutdown?.();

			expect(earlyStatus).toBe("[gt] ↓ main · ↑ - · 1 commit\n[gh] checking…");
		});
	});

	test("initial refresh starts remote work before full local status completes", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const dirtyResult = deferred<Partial<ExecResult>>();
			const ghStarted = deferred<void>();
			const pi = new LifecycleFakePi([
				headOidStep(),
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				revListStep("main", 1),
				step("git", ["status", "--porcelain=v1"], dirtyResult.promise),
				remoteOriginStep(),
				{
					...step(
						"gh",
						[
							"api",
							"graphql",
							"-f",
							`query=${githubWorktreePrStatusQuery}`,
							"-f",
							"owner=dagster-io",
							"-f",
							"repo=asdl-tools",
							"-f",
							"headRefName=feature/current",
						],
						{ stdout: JSON.stringify({ data: { repository: { pullRequests: { nodes: [] } } } }) },
					),
					onCall: () => ghStarted.resolve(),
				},
			]);
			const ctx: ExtensionContext = {
				cwd: root,
				hasUI: true,
				ui: {
					theme: TEST_THEME,
					setStatus() {},
					setWidget() {},
				},
			};

			worktreeStatusExtension(pi as ExtensionAPI);
			const sessionStart = pi.sessionStart?.({}, ctx);
			await ghStarted.promise;
			dirtyResult.resolve({ stdout: "" });
			await sessionStart;

			pi.assertDone();
			await pi.sessionShutdown?.();
		});
	});

	test("identity-changing local refresh clears stale gh and refreshes immediately", async () => {
		vi.useFakeTimers();
		try {
			await withTempRoot(makeGraphiteRepo(), async (root) => {
				const secondGhResult = deferred<Partial<ExecResult>>();
				const secondDirtyChecked = deferred<void>();
				const pi = new LifecycleFakePi([
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...ghNoPrSteps(),
					...basicGitStatusScript(),
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					revListStep("main", 2),
					{ ...dirtyStep(), onCall: () => secondDirtyChecked.resolve() },
					headOidStep("def456"),
					remoteOriginStep(),
					step(
						"gh",
						[
							"api",
							"graphql",
							"-f",
							`query=${githubWorktreePrStatusQuery}`,
							"-f",
							"owner=dagster-io",
							"-f",
							"repo=asdl-tools",
							"-f",
							"headRefName=feature/current",
						],
						secondGhResult.promise,
					),
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
				await pi.toolResult?.({ toolName: "edit" });
				await vi.advanceTimersByTimeAsync(501);
				await secondDirtyChecked.promise;
				await flushPromises();

				const pendingStatus = stripTerminalEscapes(statuses.get("worktree-status") ?? "");
				expect(pendingStatus).toContain("[gt] ↓ main · ↑ - · 2 commits");
				expect(pendingStatus).toContain("[gh] checking…");
				expect(pendingStatus).not.toContain("[gh] no PR");

				secondGhResult.resolve({ stdout: JSON.stringify({ data: { repository: { pullRequests: { nodes: [] } } } }) });
				await flushPromises();

				expect(pi.errors).toEqual([]);
				expect(pi.calls.filter((call) => call.command === "gh")).toHaveLength(2);
				expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toContain("[gh] no PR");
				await pi.sessionShutdown?.();
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test("mutating tool refreshes local status without invoking gh", async () => {
		vi.useFakeTimers();
		try {
			await withTempRoot(makeGraphiteRepo(), async (root) => {
				const pi = new LifecycleFakePi([
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...ghNoPrSteps(),
					...basicGitStatusScript(),
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...basicGitStatusScript("main", 2, " M file.txt\n"),
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
				await pi.toolResult?.({ toolName: "edit" });
				await vi.advanceTimersByTimeAsync(501);
				await flushPromises();

				expect(pi.errors).toEqual([]);
				expect(pi.calls.filter((call) => call.command === "brmem")).toHaveLength(2);
				expect(pi.calls.filter((call) => call.command === "gh")).toHaveLength(1);
				expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toContain("[gh] no PR");
				await pi.sessionShutdown?.();
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test("agent end refreshes remote gh status intentionally", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new LifecycleFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				...ghNoPrSteps(),
				...basicGitStatusScript(),
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				...ghNoPrSteps(),
				...basicGitStatusScript(),
			]);
			const ctx: ExtensionContext = {
				cwd: root,
				hasUI: true,
				ui: {
					theme: TEST_THEME,
					setStatus() {},
					setWidget() {},
				},
			};

			worktreeStatusExtension(pi as ExtensionAPI);
			await pi.sessionStart?.({}, ctx);
			await pi.agentEnd?.();

			pi.assertDone();
			expect(pi.calls.filter((call) => call.command === "gh")).toHaveLength(2);
			await pi.sessionShutdown?.();
		});
	});

	test("custom footer reads cwd branch from worktree instead of stale footer data", async () => {
		await withTempRoot(makeGraphiteRepo("current-branch", [
			{ branchName: "main", children: ["current-branch"], validationResult: "TRUNK" },
			{ branchName: "current-branch", parentBranchName: "main" },
		]), async (root) => {
			const pi = new LifecycleFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: { entries: [] },
					}),
				}),
				...ghNoPrSteps("current-branch"),
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
			expect(footerLines[0]).toBe(`[wt] repo:${basename(root)} wt:no-slot pwd:${root} | br:current-branch ↓:main commits:1 ↑:-`);
			expect(footerLines[0]).not.toContain("stale-branch");
			await pi.sessionShutdown?.();
		});
	});

	test("custom footer formats slot identity and truncates nested path before branch", async () => {
		const tempRoot = mkdtempSync(join(tmpdir(), "worktree-status-slots-"));
		await withTempRoot(tempRoot, async (root) => {
			const worktreeRoot = join(root, ".slots", "repos", "asdl-tools", "worktrees", "slot-02");
			const nestedCwd = join(worktreeRoot, "ts", "界面", "pi-extensions");
			mkdirSync(join(worktreeRoot, ".git"), { recursive: true });
			mkdirSync(nestedCwd, { recursive: true });
			writeFileSync(join(worktreeRoot, ".git", "HEAD"), "ref: refs/heads/feature/slot-identity\n");
			const pi = new LifecycleFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				...ghNoPrSteps("feature/slot-identity"),
				dirtyStep(" M file.txt\n"),
				headOidStep(),
			]);
			const statuses = new Map<string, string>();
			let footerFactory: Parameters<NonNullable<ExtensionContext["ui"]["setFooter"]>>[0];
			const ctx: ExtensionContext = {
				cwd: worktreeRoot,
				hasUI: true,
				sessionManager: {
					getEntries() {
						return [];
					},
					getCwd() {
						return nestedCwd;
					},
					getSessionName() {
						return "hidden-session-name";
					},
				},
				model: { id: "test-model", contextWindow: 272000 },
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

			const wideFooterRaw = footer.render(200)[0] ?? "";
			const truecolorPrefix = "\x1B[38;" + "2";
			expect(wideFooterRaw).not.toContain(truecolorPrefix);
			expect(wideFooterRaw).toContain("\x1B[36masdl-tools\x1B[39m");
			expect(wideFooterRaw).toContain("\x1B[36mslot-02\x1B[39m");
			expect(wideFooterRaw).toContain("\x1B[36mts/界面/pi-extensions\x1B[39m");
			expect(wideFooterRaw).toContain("\x1B[31m✗\x1B[39m");
			const wideFooterLines = [wideFooterRaw].map(stripTerminalEscapes);
			expect(wideFooterLines[0]).toBe("[wt] repo:asdl-tools wt:slot-02 pwd:ts/界面/pi-extensions (✗) | br:feature/slot-identity ↓:- commits:? ↑:-");
			expect(wideFooterLines[0]).not.toContain("hidden-session-name");
			expect(wideFooterLines[0]).not.toContain("stale-branch");
			const narrowIdentityRaw = footer.render(46)[0] ?? "";
			const narrowIdentity = stripTerminalEscapes(narrowIdentityRaw);
			expect(narrowIdentity).toContain("[wt] repo:asdl-tools wt:slot-02");
			expect(narrowIdentity).toContain("...");
			expect(visibleWidth(narrowIdentityRaw)).toBeLessThanOrEqual(46);
			await pi.sessionShutdown?.();
		});
	});

	test("custom footer tolerates context usage estimation failures", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new LifecycleFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: { entries: [] },
					}),
				}),
				...ghNoPrSteps(),
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
					throw new TypeError("Cannot read properties of undefined (reading 'length')");
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
						return "main";
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

			expect(footer.render(200).map(stripTerminalEscapes).some((line) => line.includes("?/272k (auto)"))).toBe(true);
			await pi.sessionShutdown?.();
		});
	});

	test("custom footer renders multiline worktree status as separate footer lines", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new LifecycleFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: {
							entries: [{ namespace: "pb-plan", key: "handoffs-graphite-footer-lines.md" }],
						},
					}),
				}),
				...ghNoPrSteps(),
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
						return new Map([
							...statuses,
							["worktree-status", "[gt] future format that should be ignored\n[gh] stale text"],
							["sdl-submit", "/sdl:submit running CLI command (23s)"],
						]);
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
			expect(footerLines[0]).toBe(`[wt] repo:${basename(root)} wt:no-slot pwd:${root} | br:feature/current ↓:main commits:1 ↑:-`);
			expect(footerLines[1]).toBe("[brmem] (pb-plan: handoffs-graphite-footer-lines.md)");
			expect(footerLines[2]).toBe("[gh] no PR");
			expect(footerLines[3]).toContain("18.2%/272k (auto)");
			expect(footerLines.at(-1)).toBe("/sdl:submit running CLI command (23s)");
			expect(footerLines).not.toContain("[gt] future format that should be ignored");
			expect(footerLines).not.toContain("[gh] stale text");
			await pi.sessionShutdown?.();
		});
	});
});
