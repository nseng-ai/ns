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
		await withTempRoot(makeGraphiteRepo(), async (root) => {
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
		});
	});
});
