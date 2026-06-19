import { describe, expect, test } from "vitest";

import { stripTerminalEscapes } from "@asdl/core/exec";
import { createManualTimerHarness } from "@asdl/core/testing";
import type { LocalWorktreeStatus } from "@asdl/ccc/worktree-status";
import {
	makeGraphiteRepo,
	withTempRoot,
} from "../../ccc/test/integration/worktree-status-fixtures.ts";
import {
	basicGitStatusScript,
	brmemListStep,
	deferred,
	dirtyStep,
	fakeWorktreeStatusLoaders,
	flushPromises,
	ghNoPrSteps,
	gtStatus,
	headOidStep,
	LifecycleFakePi,
	localStatus,
	queued,
	revListStep,
	TEST_THEME,
	testContext,
} from "./worktree-status-test-support.ts";
import worktreeStatusExtension, {
	WORKTREE_STATUS_REFRESH_COMMAND_NAME,
	type ExtensionAPI,
	type ExtensionContext,
} from "../src/worktree-status.ts";

describe("worktree status refresh lifecycle", () => {
	test("background timer limits GitHub refreshes to every fifteen seconds", async () => {
		const harness = createManualTimerHarness();
		const refreshBeforeInterval = deferred<void>();
		const refreshAfterInterval = deferred<void>();
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(localStatus()),
				queued(localStatus(), () => refreshBeforeInterval.resolve()),
				queued(localStatus(), () => refreshAfterInterval.resolve()),
			],
			ghStatuses: [queued({ type: "no-pr" }), queued({ type: "no-pr" })],
		});
		const ctx = testContext();

		worktreeStatusExtension(pi as ExtensionAPI, {
			loaders,
			timers: harness.timers,
			clock: harness.clock,
			refreshIntervalMs: 10_000,
		});
		await pi.sessionStart?.({}, ctx);
		expect(loaders.ghCalls).toHaveLength(1);

		harness.advanceMs(10_000);
		await refreshBeforeInterval.promise;
		await flushPromises();
		expect(loaders.ghCalls).toHaveLength(1);

		harness.advanceMs(10_000);
		await refreshAfterInterval.promise;
		await flushPromises();
		expect(loaders.ghCalls).toHaveLength(2);

		pi.assertDone();
		await pi.sessionShutdown?.();
	});

	test("mutating tool completion refreshes dirty footer state", async () => {
		const toolRefreshLoaded = deferred<void>();
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(localStatus()),
				queued(localStatus({ gt: gtStatus({ dirty: "yes" }) }), () => toolRefreshLoaded.resolve()),
			],
			ghStatuses: [queued({ type: "no-pr" })],
		});
		const statuses = new Map<string, string | undefined>();
		const ctx = testContext(statuses);

		worktreeStatusExtension(pi as ExtensionAPI, { loaders, refreshIntervalMs: 60_000 });
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
		await toolRefreshLoaded.promise;
		await flushPromises();

		pi.assertDone();
		expect(loaders.ghCalls).toHaveLength(1);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[gt] ↓ main · ↑ - · 1 commit · ✗\n[gh] no PR",
		);
		await pi.sessionShutdown?.();
	});

	test("user message completion refreshes stale dirty footer state", async () => {
		const userMessageRefreshDirtyChecked = deferred<void>();
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(localStatus({ gt: gtStatus({ dirty: "yes" }) })),
				queued(localStatus(), () => userMessageRefreshDirtyChecked.resolve()),
			],
			ghStatuses: [queued({ type: "no-pr" })],
		});
		const statuses = new Map<string, string | undefined>();
		const ctx = testContext(statuses);

		worktreeStatusExtension(pi as ExtensionAPI, { loaders, refreshIntervalMs: 60_000 });
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
		expect(loaders.ghCalls).toHaveLength(1);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
		);
		await pi.sessionShutdown?.();
	});

	test("turn completion refreshes footer without mutating tool event", async () => {
		const turnRefreshDirtyChecked = deferred<void>();
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(localStatus()),
				queued(localStatus({ gt: gtStatus({ dirty: "yes" }) }), () =>
					turnRefreshDirtyChecked.resolve(),
				),
			],
			ghStatuses: [queued({ type: "no-pr" })],
		});
		const statuses = new Map<string, string | undefined>();
		const ctx = testContext(statuses);

		worktreeStatusExtension(pi as ExtensionAPI, { loaders, refreshIntervalMs: 60_000 });
		await pi.sessionStart?.({}, ctx);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
		);

		await pi.emit("turn_end", { type: "turn_end", turnIndex: 0 }, ctx);
		await turnRefreshDirtyChecked.promise;
		await flushPromises();

		pi.assertDone();
		expect(loaders.ghCalls).toHaveLength(1);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[gt] ↓ main · ↑ - · 1 commit · ✗\n[gh] no PR",
		);
		await pi.sessionShutdown?.();
	});

	test("manual refresh reruns full local and remote status", async () => {
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(localStatus()),
				queued(
					localStatus({
						brmem: "(branch-context: manual-refresh-plan.md)",
						gt: gtStatus({ commits: { type: "count", count: 2 }, dirty: "yes" }),
					}),
				),
			],
			ghStatuses: [queued({ type: "no-pr" }), queued({ type: "no-pr" })],
		});
		const statuses = new Map<string, string | undefined>();
		const ctx = testContext(statuses);

		worktreeStatusExtension(pi as ExtensionAPI, { loaders });
		const command = pi.commands.get(WORKTREE_STATUS_REFRESH_COMMAND_NAME);
		expect(command).toBeDefined();
		if (command === undefined) throw new Error("expected manual refresh command");
		await pi.sessionStart?.({}, ctx);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
		);

		await command.handler("", ctx);

		pi.assertDone();
		expect(loaders.localCalls).toHaveLength(2);
		expect(loaders.ghCalls).toHaveLength(2);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[brmem] (branch-context: manual-refresh-plan.md)\n[gt] ↓ main · ↑ - · 2 commits · ✗\n[gh] no PR",
		);
		await pi.sessionShutdown?.();
	});

	test("coalesces manual refresh while startup refresh is in flight", async () => {
		const firstLocalResult = deferred<LocalWorktreeStatus>();
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [queued(firstLocalResult.promise), queued(localStatus())],
			ghStatuses: [queued({ type: "no-pr" }), queued({ type: "no-pr" })],
		});
		const ctx = testContext();

		worktreeStatusExtension(pi as ExtensionAPI, { loaders });
		const command = pi.commands.get(WORKTREE_STATUS_REFRESH_COMMAND_NAME);
		expect(command).toBeDefined();
		if (command === undefined) throw new Error("expected manual refresh command");
		const sessionStart = pi.sessionStart?.({}, ctx);
		await flushPromises();

		expect(loaders.localCalls).toHaveLength(1);
		const commandRefresh = command.handler("", ctx);
		await flushPromises();
		expect(loaders.localCalls).toHaveLength(1);

		firstLocalResult.resolve(localStatus());
		await Promise.all([sessionStart, commandRefresh]);

		expect(loaders.localCalls).toHaveLength(2);
		pi.assertDone();
		await pi.sessionShutdown?.();
	});
});
