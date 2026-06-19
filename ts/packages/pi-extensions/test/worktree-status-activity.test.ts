import { describe, expect, test, vi } from "vitest";

import { stripTerminalEscapes } from "@asdl/core/exec";
import {
	deferred,
	fakeWorktreeStatusLoaders,
	flushPromises,
	gtStatus,
	LifecycleFakePi,
	localStatus,
	queued,
	TEST_THEME,
} from "./worktree-status-test-support.ts";
import worktreeStatusExtension, {
	WORKTREE_STATUS_REFRESH_COMMAND_NAME,
	type ExtensionAPI,
	type ExtensionContext,
} from "../src/worktree-status.ts";

describe("worktree status activity lifecycle", () => {
	test("worktree status enters dormant mode after two minutes of idle session time", async () => {
		vi.useFakeTimers();
		try {
			const pi = new LifecycleFakePi([]);
			const loaders = fakeWorktreeStatusLoaders();
			const statuses = new Map<string, string | undefined>();
			const ctx = testContext(statuses, { isIdle: true });

			worktreeStatusExtension(pi as ExtensionAPI, { ...loaders, refreshIntervalMs: 300_000 });
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
			expect(loaders.localCalls).toHaveLength(1);
			expect(loaders.ghCalls).toHaveLength(1);
			await pi.sessionShutdown?.();
		} finally {
			vi.useRealTimers();
		}
	});

	test("terminal activity wakes dormant worktree status and forces a refresh", async () => {
		vi.useFakeTimers();
		try {
			const wakeLocalLoaded = deferred<void>();
			let terminalInput: ((data: string) => unknown) | undefined;
			const pi = new LifecycleFakePi([]);
			const loaders = fakeWorktreeStatusLoaders({
				localStatuses: [
					queued(localStatus()),
					queued(localStatus({ gt: gtStatus({ commits: { type: "count", count: 2 } }) }), () =>
						wakeLocalLoaded.resolve(),
					),
				],
				ghStatuses: [queued({ type: "no-pr" }), queued({ type: "no-pr" })],
			});
			const statuses = new Map<string, string | undefined>();
			const ctx = testContext(statuses, {
				isIdle: true,
				onTerminalInput(handler) {
					terminalInput = handler;
					return () => {
						terminalInput = undefined;
					};
				},
			});

			worktreeStatusExtension(pi as ExtensionAPI, { ...loaders, refreshIntervalMs: 300_000 });
			await pi.sessionStart?.({}, ctx);
			await vi.advanceTimersByTimeAsync(120_000);
			await flushPromises();
			expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toContain(
				"[wt] dormant after 2m idle",
			);

			terminalInput?.("a");
			await wakeLocalLoaded.promise;
			await flushPromises();

			pi.assertDone();
			expect(loaders.localCalls).toHaveLength(2);
			expect(loaders.ghCalls).toHaveLength(2);
			expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
				"[gt] ↓ main · ↑ - · 2 commits\n[gh] no PR",
			);
			await pi.sessionShutdown?.();
		} finally {
			vi.useRealTimers();
		}
	});

	test("manual refresh wakes dormant worktree status", async () => {
		vi.useFakeTimers();
		try {
			const pi = new LifecycleFakePi([]);
			const loaders = fakeWorktreeStatusLoaders({
				localStatuses: [
					queued(localStatus()),
					queued(localStatus({ gt: gtStatus({ commits: { type: "count", count: 3 } }) })),
				],
				ghStatuses: [queued({ type: "no-pr" }), queued({ type: "no-pr" })],
			});
			const statuses = new Map<string, string | undefined>();
			const ctx = testContext(statuses, { isIdle: true });

			worktreeStatusExtension(pi as ExtensionAPI, { ...loaders, refreshIntervalMs: 300_000 });
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

function testContext(
	statuses: Map<string, string | undefined>,
	options: {
		isIdle?: boolean | undefined;
		onTerminalInput?: ExtensionContext["ui"]["onTerminalInput"] | undefined;
	} = {},
): ExtensionContext {
	return {
		cwd: "/repo",
		hasUI: true,
		isIdle() {
			return options.isIdle ?? false;
		},
		ui: {
			theme: TEST_THEME,
			setStatus(key, value) {
				statuses.set(key, value);
			},
			setWidget() {},
			...(options.onTerminalInput === undefined
				? {}
				: { onTerminalInput: options.onTerminalInput }),
		},
	};
}
