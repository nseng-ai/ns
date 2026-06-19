import { describe, expect, test, vi } from "vitest";

import { stripTerminalEscapes } from "@asdl/core/exec";
import type { ExecResult } from "@asdl/ccc/worktree-status";
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
	type ScriptedExec,
	TEST_THEME,
} from "./worktree-status-test-support.ts";
import worktreeStatusExtension, {
	WORKTREE_STATUS_REFRESH_COMMAND_NAME,
	type ExtensionAPI,
	type ExtensionContext,
} from "../src/worktree-status.ts";

describe("worktree status refresh lifecycle", () => {
	test("background timer limits GitHub refreshes to every fifteen seconds", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			vi.useFakeTimers();
			try {
				const refreshBeforeIntervalDirty = deferred<void>();
				const refreshAfterIntervalDirty = deferred<void>();
				const emptyBrmem = { stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) };
				const localRefreshSteps = (dirtyChecked: () => void): ScriptedExec[] => [
					brmemListStep(emptyBrmem),
					revListStep("main", 1),
					{ ...dirtyStep(), onCall: dirtyChecked },
					headOidStep(),
				];
				const pi = new LifecycleFakePi([
					// Initial startup refresh fetches GitHub immediately.
					brmemListStep(emptyBrmem),
					...ghNoPrSteps(),
					...basicGitStatusScript(),
					// First timer tick before the throttle interval refreshes local status only.
					...localRefreshSteps(() => refreshBeforeIntervalDirty.resolve()),
					// Later timer tick at/after the throttle interval may fetch GitHub again.
					brmemListStep(emptyBrmem),
					...ghNoPrSteps(),
					revListStep("main", 1),
					{ ...dirtyStep(), onCall: () => refreshAfterIntervalDirty.resolve() },
					headOidStep(),
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

				worktreeStatusExtension(pi as ExtensionAPI, { refreshIntervalMs: 10_000 });
				await pi.sessionStart?.({}, ctx);
				const ghCount = (): number => pi.calls.filter((call) => call.command === "gh").length;
				expect(ghCount()).toBe(1);

				await vi.advanceTimersByTimeAsync(10_000);
				await refreshBeforeIntervalDirty.promise;
				await flushPromises();
				expect(ghCount()).toBe(1);

				await vi.advanceTimersByTimeAsync(10_000);
				await refreshAfterIntervalDirty.promise;
				await flushPromises();
				expect(ghCount()).toBe(2);

				pi.assertDone();
				await pi.sessionShutdown?.();
			} finally {
				vi.useRealTimers();
			}
		});
	});

	test("mutating tool completion refreshes dirty footer state", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const toolRefreshDirtyChecked = deferred<void>();
			const pi = new LifecycleFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				...ghNoPrSteps(),
				...basicGitStatusScript("main", 1, "", "abc123"),
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				revListStep("main", 1),
				{ ...dirtyStep(" M file.txt\n"), onCall: () => toolRefreshDirtyChecked.resolve() },
				headOidStep("abc123"),
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

			worktreeStatusExtension(pi as ExtensionAPI, { refreshIntervalMs: 60_000 });
			await pi.sessionStart?.({}, ctx);
			expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
				"[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
			);

			await pi.emit(
				"tool_execution_end",
				{
					type: "tool_execution_end",
					toolCallId: "tool-1",
					toolName: "write",
					result: {},
					isError: false,
				},
				ctx,
			);
			await toolRefreshDirtyChecked.promise;
			await flushPromises();

			pi.assertDone();
			expect(pi.calls.filter((call) => call.command === "gh")).toHaveLength(1);
			expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
				"[gt] ↓ main · ↑ - · 1 commit · ✗\n[gh] no PR",
			);
			await pi.sessionShutdown?.();
		});
	});

	test("user message completion refreshes stale dirty footer state", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const userMessageRefreshDirtyChecked = deferred<void>();
			const pi = new LifecycleFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				...ghNoPrSteps(),
				...basicGitStatusScript("main", 1, " M file.txt\n", "abc123"),
				headOidStep("abc123"),
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				revListStep("main", 1),
				{ ...dirtyStep(), onCall: () => userMessageRefreshDirtyChecked.resolve() },
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

			worktreeStatusExtension(pi as ExtensionAPI, { refreshIntervalMs: 60_000 });
			await pi.sessionStart?.({}, ctx);
			expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
				"[gt] ↓ main · ↑ - · 1 commit · ✗\n[gh] no PR",
			);

			await pi.emit(
				"message_end",
				{ type: "message_end", message: { role: "user", content: "committed changes" } },
				ctx,
			);
			await userMessageRefreshDirtyChecked.promise;
			await flushPromises();

			pi.assertDone();
			expect(pi.calls.filter((call) => call.command === "gh")).toHaveLength(1);
			expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
				"[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
			);
			await pi.sessionShutdown?.();
		});
	});

	test("turn completion refreshes footer without mutating tool event", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const turnRefreshDirtyChecked = deferred<void>();
			const pi = new LifecycleFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				...ghNoPrSteps(),
				...basicGitStatusScript("main", 1, "", "abc123"),
				headOidStep("abc123"),
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				revListStep("main", 1),
				{ ...dirtyStep(" M file.txt\n"), onCall: () => turnRefreshDirtyChecked.resolve() },
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

			worktreeStatusExtension(pi as ExtensionAPI, { refreshIntervalMs: 60_000 });
			await pi.sessionStart?.({}, ctx);
			expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
				"[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
			);

			await pi.emit("turn_end", { type: "turn_end", turnIndex: 0 }, ctx);
			await turnRefreshDirtyChecked.promise;
			await flushPromises();

			pi.assertDone();
			expect(pi.calls.filter((call) => call.command === "gh")).toHaveLength(1);
			expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
				"[gt] ↓ main · ↑ - · 1 commit · ✗\n[gh] no PR",
			);
			await pi.sessionShutdown?.();
		});
	});

	test("manual refresh reruns full local and remote status", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new LifecycleFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				...ghNoPrSteps(),
				...basicGitStatusScript(),
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: { entries: [{ namespace: "branch-context", key: "manual-refresh-plan.md" }] },
					}),
				}),
				...ghNoPrSteps(),
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
			const command = pi.commands.get(WORKTREE_STATUS_REFRESH_COMMAND_NAME);
			expect(command).toBeDefined();
			if (command === undefined) throw new Error("expected manual refresh command");
			await pi.sessionStart?.({}, ctx);
			expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
				"[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
			);

			await command.handler("", ctx);

			pi.assertDone();
			expect(pi.calls.filter((call) => call.command === "brmem")).toHaveLength(2);
			expect(pi.calls.filter((call) => call.command === "gh")).toHaveLength(2);
			expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
				"[brmem] (branch-context: manual-refresh-plan.md)\n[gt] ↓ main · ↑ - · 2 commits · ✗\n[gh] no PR",
			);
			await pi.sessionShutdown?.();
		});
	});

	test("coalesces manual refresh while startup refresh is in flight", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const firstBrmemResult = deferred<Partial<ExecResult>>();
			const pi = new LifecycleFakePi([
				brmemListStep(firstBrmemResult.promise),
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
			const command = pi.commands.get(WORKTREE_STATUS_REFRESH_COMMAND_NAME);
			expect(command).toBeDefined();
			if (command === undefined) throw new Error("expected manual refresh command");
			const sessionStart = pi.sessionStart?.({}, ctx);
			await flushPromises();

			expect(pi.calls.filter((call) => call.command === "brmem")).toHaveLength(1);
			const commandRefresh = command.handler("", ctx);
			await flushPromises();
			expect(pi.calls.filter((call) => call.command === "brmem")).toHaveLength(1);

			firstBrmemResult.resolve({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) });
			await Promise.all([sessionStart, commandRefresh]);

			expect(pi.calls.filter((call) => call.command === "brmem")).toHaveLength(2);
			pi.assertDone();
			await pi.sessionShutdown?.();
		});
	});
});
