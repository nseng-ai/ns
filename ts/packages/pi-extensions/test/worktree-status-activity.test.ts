import { describe, expect, test, vi } from "vitest";

import { stripTerminalEscapes } from "@asdl/core/exec";
import { makeGraphiteRepo, withTempRoot } from "./worktree-status-fixtures.ts";
import {
	basicGitStatusScript,
	brmemListStep,
	deferred,
	dirtyStep,
	flushPromises,
	ghNoPrSteps,
	headOidStep,
	LifecycleFakePi,
	revListStep,
	TEST_THEME,
} from "./worktree-status-test-support.ts";
import worktreeStatusExtension, {
	WORKTREE_STATUS_REFRESH_COMMAND_NAME,
	type ExtensionAPI,
	type ExtensionContext,
} from "../src/worktree-status.ts";

describe("worktree status activity lifecycle", () => {
	test("worktree status enters dormant mode after two minutes of idle session time", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			vi.useFakeTimers();
			try {
				const pi = new LifecycleFakePi([
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...ghNoPrSteps(),
					...basicGitStatusScript(),
				]);
				const statuses = new Map<string, string | undefined>();
				const ctx: ExtensionContext = {
					cwd: root,
					hasUI: true,
					isIdle() {
						return true;
					},
					ui: {
						theme: TEST_THEME,
						setStatus(key, value) {
							statuses.set(key, value);
						},
						setWidget() {},
					},
				};

				worktreeStatusExtension(pi as ExtensionAPI, { refreshIntervalMs: 300_000 });
				await pi.sessionStart?.({}, ctx);
				expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
					"[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
				);

				await vi.advanceTimersByTimeAsync(120_000);
				await flushPromises();

				expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
					"[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR\n[wt] dormant after 2m idle",
				);

				await vi.advanceTimersByTimeAsync(60_000);
				await flushPromises();

				pi.assertDone();
				expect(pi.calls.filter((call) => call.command === "brmem")).toHaveLength(1);
				expect(pi.calls.filter((call) => call.command === "gh")).toHaveLength(1);
				await pi.sessionShutdown?.();
			} finally {
				vi.useRealTimers();
			}
		});
	});

	test("terminal activity wakes dormant worktree status and forces a refresh", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			vi.useFakeTimers();
			try {
				const wakeDirtyChecked = deferred<void>();
				let terminalInput: ((data: string) => unknown) | undefined;
				const pi = new LifecycleFakePi([
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...ghNoPrSteps(),
					...basicGitStatusScript("main", 1, "", "abc123"),
					headOidStep("abc123"),
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...ghNoPrSteps(),
					revListStep("main", 2),
					{ ...dirtyStep(), onCall: () => wakeDirtyChecked.resolve() },
				]);
				const statuses = new Map<string, string | undefined>();
				const ctx: ExtensionContext = {
					cwd: root,
					hasUI: true,
					isIdle() {
						return true;
					},
					ui: {
						theme: TEST_THEME,
						setStatus(key, value) {
							statuses.set(key, value);
						},
						setWidget() {},
						onTerminalInput(handler) {
							terminalInput = handler;
							return () => {
								terminalInput = undefined;
							};
						},
					},
				};

				worktreeStatusExtension(pi as ExtensionAPI, { refreshIntervalMs: 300_000 });
				await pi.sessionStart?.({}, ctx);
				await vi.advanceTimersByTimeAsync(120_000);
				await flushPromises();
				expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toContain(
					"[wt] dormant after 2m idle",
				);

				terminalInput?.("a");
				await wakeDirtyChecked.promise;
				await flushPromises();

				pi.assertDone();
				expect(pi.calls.filter((call) => call.command === "brmem")).toHaveLength(2);
				expect(pi.calls.filter((call) => call.command === "gh")).toHaveLength(2);
				expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
					"[gt] ↓ main · ↑ - · 2 commits\n[gh] no PR",
				);
				await pi.sessionShutdown?.();
			} finally {
				vi.useRealTimers();
			}
		});
	});

	test("manual refresh wakes dormant worktree status", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			vi.useFakeTimers();
			try {
				const pi = new LifecycleFakePi([
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...ghNoPrSteps(),
					...basicGitStatusScript(),
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...ghNoPrSteps(),
					...basicGitStatusScript("main", 3),
				]);
				const statuses = new Map<string, string | undefined>();
				const ctx: ExtensionContext = {
					cwd: root,
					hasUI: true,
					isIdle() {
						return true;
					},
					ui: {
						theme: TEST_THEME,
						setStatus(key, value) {
							statuses.set(key, value);
						},
						setWidget() {},
					},
				};

				worktreeStatusExtension(pi as ExtensionAPI, { refreshIntervalMs: 300_000 });
				const command = pi.commands.get(WORKTREE_STATUS_REFRESH_COMMAND_NAME);
				expect(command).toBeDefined();
				if (command === undefined) throw new Error("expected manual refresh command");
				await pi.sessionStart?.({}, ctx);
				await vi.advanceTimersByTimeAsync(120_000);
				await flushPromises();
				expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toContain(
					"[wt] dormant after 2m idle",
				);

				await command.handler("", ctx);

				pi.assertDone();
				expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
					"[gt] ↓ main · ↑ - · 3 commits\n[gh] no PR",
				);
				await pi.sessionShutdown?.();
			} finally {
				vi.useRealTimers();
			}
		});
	});
});
