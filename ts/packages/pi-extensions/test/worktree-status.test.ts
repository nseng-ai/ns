import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { describe, expect, test } from "vitest";

import { stripTerminalEscapes } from "@asdl/core/exec";
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
	result: Partial<ExecResult> | undefined;
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

function basicGitStatusScript(base = "main", count = 1, dirtyStdout = ""): ScriptedExec[] {
	return [revListStep(base, count), dirtyStep(dirtyStdout)];
}

function brmemListStep(result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["list", "--format", "json"], result);
}

function ghNoPrStep(): ScriptedExec {
	return step("gh", ["pr", "view", "--json", "number,url,statusCheckRollup"], { code: 1, stderr: "no pull request found" });
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

const MARKER_THEME: StatusTheme = {
	fg(color, value) {
		return `<${color}>${value}</${color}>`;
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
				ghNoPrStep(),
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
				ghNoPrStep(),
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
				ghNoPrStep(),
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
			const nestedCwd = join(worktreeRoot, "ts", "packages", "pi-extensions");
			mkdirSync(join(worktreeRoot, ".git"), { recursive: true });
			mkdirSync(nestedCwd, { recursive: true });
			writeFileSync(join(worktreeRoot, ".git", "HEAD"), "ref: refs/heads/feature/slot-identity\n");
			const pi = new LifecycleFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				ghNoPrStep(),
				dirtyStep(" M file.txt\n"),
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
				MARKER_THEME,
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
			expect(wideFooterRaw).toContain("<dim>[wt]</dim><dim> </dim><dim>repo:</dim><accent>asdl-tools</accent>");
			expect(wideFooterRaw).toContain("<dim>wt:</dim><accent>slot-02</accent>");
			expect(wideFooterRaw).toContain("<dim>pwd:</dim><dim>ts/packages/pi-extensions</dim>");
			expect(wideFooterRaw).toContain("<dim>br:</dim><accent>feature/slot-identity</accent>");
			expect(wideFooterRaw).toContain("<error>✗</error>");
			const wideFooterLines = [wideFooterRaw.replace(/<[^>]+>/g, "")];
			expect(wideFooterLines[0]).toBe("[wt] repo:asdl-tools wt:slot-02 pwd:ts/packages/pi-extensions (✗) | br:feature/slot-identity ↓:- commits:? ↑:-");
			expect(wideFooterLines[0]).not.toContain("hidden-session-name");
			expect(wideFooterLines[0]).not.toContain("stale-branch");
			const narrowIdentity = footer.render(46).map((line) => line.replace(/<[^>]+>/g, ""))[0] ?? "";
			expect(narrowIdentity).toContain("[wt] repo:asdl-tools wt:slot-02");
			expect(narrowIdentity).toContain("...");
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
				ghNoPrStep(),
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
				ghNoPrStep(),
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
