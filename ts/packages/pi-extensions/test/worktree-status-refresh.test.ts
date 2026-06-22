import { describe, expect, test } from "vitest";

import { stripTerminalEscapes } from "@sdl/core/exec";
import { createManualTimerHarness } from "@sdl/core/testing";
import type { LocalWorktreeStatus } from "@sdl/ccc/worktree-status";
import {
	PI_EXTENSION_COMMAND_FINISHED_EVENT,
	type PiExtensionCommandEventHandler,
	type PiExtensionCommandFinishedEvent,
} from "../src/extension-command-events.ts";
import {
	deferred,
	fakeWorktreeStatusLoaders,
	flushPromises,
	gtStatus,
	LifecycleFakePi,
	localStatus,
	queued,
	testContext,
} from "./worktree-status-test-support.ts";
import worktreeStatusExtension, {
	requestWorktreeStatusRefresh,
	WORKTREE_STATUS_REFRESH_COMMAND_NAME,
	type ExtensionAPI,
} from "../src/worktree-status.ts";
import { WORKTREE_STATUS_DORMANT_AFTER_MS } from "../src/worktree-status-activity.ts";

describe("worktree status refresh lifecycle", () => {
	test("background timer refreshes local status without polling GitHub", async () => {
		const harness = createManualTimerHarness();
		const firstTimerRefresh = deferred<void>();
		const secondTimerRefresh = deferred<void>();
		const thirdTimerRefresh = deferred<void>();
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(localStatus()),
				queued(localStatus(), () => firstTimerRefresh.resolve()),
				queued(localStatus(), () => secondTimerRefresh.resolve()),
				queued(localStatus(), () => thirdTimerRefresh.resolve()),
			],
			ghStatuses: [queued({ type: "no-pr" })],
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
		await firstTimerRefresh.promise;
		await flushPromises();
		expect(loaders.ghCalls).toHaveLength(1);

		harness.advanceMs(10_000);
		await secondTimerRefresh.promise;
		await flushPromises();
		expect(loaders.ghCalls).toHaveLength(1);

		harness.advanceMs(10_000);
		await thirdTimerRefresh.promise;
		await flushPromises();
		expect(loaders.ghCalls).toHaveLength(1);

		pi.assertDone();
		await pi.sessionShutdown?.();
	});

	test("mutating tool completion refreshes dirty footer state without polling GitHub", async () => {
		const harness = createManualTimerHarness();
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

		worktreeStatusExtension(pi as ExtensionAPI, {
			loaders,
			timers: harness.timers,
			clock: harness.clock,
			refreshIntervalMs: 60_000,
		});
		await pi.sessionStart?.({}, ctx);
		harness.advanceMs(30_000);
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

	test("extension command completion forces immediate GitHub refresh", async () => {
		const harness = createManualTimerHarness();
		const pi = new CommandEventLifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(localStatus()),
				queued(localStatus({ gt: gtStatus({ dirty: "yes" }) })),
			],
			ghStatuses: [queued({ type: "no-pr" }), queued({ type: "no-pr" })],
		});
		const statuses = new Map<string, string | undefined>();
		const ctx = testContext(statuses);

		worktreeStatusExtension(pi as ExtensionAPI, {
			loaders,
			timers: harness.timers,
			clock: harness.clock,
			refreshIntervalMs: WORKTREE_STATUS_DORMANT_AFTER_MS * 10,
		});
		await pi.sessionStart?.({}, ctx);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
		);

		harness.advanceMs(WORKTREE_STATUS_DORMANT_AFTER_MS / 2);
		await pi.emitCommandFinished({
			commandName: "sdl:changes",
			cwd: "/repo",
			source: "sdl flow changes",
			status: "completed",
			exitCode: 0,
		});
		await flushPromises();

		expect(loaders.localCalls).toHaveLength(2);
		expect(loaders.ghCalls).toHaveLength(2);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[gt] ↓ main · ↑ - · 1 commit · ✗\n[gh] no PR",
		);

		harness.advanceMs(WORKTREE_STATUS_DORMANT_AFTER_MS / 2 + 1);
		await flushPromises();

		pi.assertDone();
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).not.toContain(
			"[wt] dormant",
		);
		await pi.sessionShutdown?.();
	});

	test("user message completion before TTL refreshes local status without polling GitHub", async () => {
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

	test("user message completion after TTL refreshes local status and polls GitHub", async () => {
		const harness = createManualTimerHarness();
		const userMessageRefreshChecked = deferred<void>();
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(localStatus()),
				queued(localStatus(), () => userMessageRefreshChecked.resolve()),
			],
			ghStatuses: [queued({ type: "no-pr" }), queued({ type: "no-pr" })],
		});
		const ctx = testContext();

		worktreeStatusExtension(pi as ExtensionAPI, {
			loaders,
			timers: harness.timers,
			clock: harness.clock,
			refreshIntervalMs: 60_000,
		});
		await pi.sessionStart?.({}, ctx);
		expect(loaders.ghCalls).toHaveLength(1);

		harness.advanceMs(30_000);
		await pi.emit(
			"message_end",
			{ type: "message_end", message: { role: "user", content: "check status" } },
			ctx,
		);
		await userMessageRefreshChecked.promise;
		await flushPromises();

		pi.assertDone();
		expect(loaders.localCalls).toHaveLength(2);
		expect(loaders.ghCalls).toHaveLength(2);
		await pi.sessionShutdown?.();
	});

	test("turn completion refreshes footer without polling GitHub", async () => {
		const harness = createManualTimerHarness();
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

		worktreeStatusExtension(pi as ExtensionAPI, {
			loaders,
			timers: harness.timers,
			clock: harness.clock,
			refreshIntervalMs: 60_000,
		});
		await pi.sessionStart?.({}, ctx);
		harness.advanceMs(30_000);
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

	test("requestWorktreeStatusRefresh uses cached GitHub policy instead of forcing remote status", async () => {
		const harness = createManualTimerHarness();
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(localStatus()),
				queued(
					localStatus({
						gt: gtStatus({ commits: { type: "count", count: 2 }, dirty: "yes" }),
					}),
				),
				queued(
					localStatus({
						gt: gtStatus({ commits: { type: "count", count: 3 }, dirty: "yes" }),
					}),
				),
			],
			ghStatuses: [queued({ type: "no-pr" }), queued({ type: "no-pr" })],
		});
		const statuses = new Map<string, string | undefined>();
		const ctx = testContext(statuses);

		worktreeStatusExtension(pi as ExtensionAPI, {
			loaders,
			timers: harness.timers,
			clock: harness.clock,
			refreshIntervalMs: 60_000,
		});
		await pi.sessionStart?.({}, ctx);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
		);

		await requestWorktreeStatusRefresh();
		expect(loaders.localCalls).toHaveLength(2);
		expect(loaders.ghCalls).toHaveLength(1);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[gt] ↓ main · ↑ - · 2 commits · ✗\n[gh] no PR",
		);

		harness.advanceMs(30_000);
		await requestWorktreeStatusRefresh();

		pi.assertDone();
		expect(loaders.localCalls).toHaveLength(3);
		expect(loaders.ghCalls).toHaveLength(2);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[gt] ↓ main · ↑ - · 3 commits · ✗\n[gh] no PR",
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
		expect(loaders.ghCalls).toHaveLength(2);
		pi.assertDone();
		await pi.sessionShutdown?.();
	});
});

class CommandEventLifecycleFakePi extends LifecycleFakePi {
	private readonly commandEventHandlers: PiExtensionCommandEventHandler[] = [];
	readonly events = {
		on: (
			event: typeof PI_EXTENSION_COMMAND_FINISHED_EVENT,
			handler: PiExtensionCommandEventHandler,
		): void => {
			if (event === PI_EXTENSION_COMMAND_FINISHED_EVENT) {
				this.commandEventHandlers.push(handler);
			}
		},
		emit: (
			event: typeof PI_EXTENSION_COMMAND_FINISHED_EVENT,
			payload: PiExtensionCommandFinishedEvent,
		): void => {
			if (event !== PI_EXTENSION_COMMAND_FINISHED_EVENT) return;
			for (const handler of this.commandEventHandlers) void handler(payload);
		},
	};

	async emitCommandFinished(payload: PiExtensionCommandFinishedEvent): Promise<void> {
		for (const handler of this.commandEventHandlers) await handler(payload);
	}
}
