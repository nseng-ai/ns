import { describe, expect, test } from "vitest";

import { stripTerminalEscapes } from "@asdl/core/exec";
import { createManualTimerHarness } from "@asdl/core/testing";
import type { LocalWorktreeStatus } from "@asdl/ccc/worktree-status";
import {
	deferred,
	fakeWorktreeStatusLoaders,
	flushPromises,
	gtStatus,
	LifecycleFakePi,
	localStatus,
	queued,
	TEST_THEME,
	worktreeIdentity,
} from "./worktree-status-test-support.ts";
import worktreeStatusExtension, {
	WORKTREE_STATUS_REFRESH_COMMAND_NAME,
	type ExtensionAPI,
	type ExtensionContext,
} from "../src/worktree-status.ts";

describe("worktree status refresh timer", () => {
	test("startup refreshes immediately and timer refreshes after the active interval", async () => {
		const harness = createManualTimerHarness();
		const timerLocalLoaded = deferred<void>();
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(localStatus()),
				queued(localStatus(), () => timerLocalLoaded.resolve()),
			],
			ghStatuses: [queued({ type: "no-pr" })],
		});
		const ctx = testContext();

		worktreeStatusExtension(pi as ExtensionAPI, {
			...loaders,
			timers: harness.timers,
			clock: harness.clock,
			refreshIntervalMs: 1_000,
		});
		await pi.sessionStart?.({}, ctx);
		expect(loaders.localCalls).toHaveLength(1);
		expect(loaders.ghCalls).toHaveLength(1);

		harness.advanceMs(1_000);
		await timerLocalLoaded.promise;
		await flushPromises();

		expect(loaders.localCalls).toHaveLength(2);
		expect(loaders.ghCalls).toHaveLength(1);
		pi.assertDone();
		await pi.sessionShutdown?.();
	});

	test("timer waits for an in-flight refresh before scheduling the next tick", async () => {
		const harness = createManualTimerHarness();
		const firstTimerLocalResult = deferred<LocalWorktreeStatus>();
		const secondTimerLocalLoaded = deferred<void>();
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(localStatus()),
				queued(firstTimerLocalResult.promise),
				queued(localStatus(), () => secondTimerLocalLoaded.resolve()),
			],
			ghStatuses: [queued({ type: "no-pr" })],
		});
		const ctx = testContext();

		worktreeStatusExtension(pi as ExtensionAPI, {
			...loaders,
			timers: harness.timers,
			clock: harness.clock,
			refreshIntervalMs: 1_000,
		});
		await pi.sessionStart?.({}, ctx);
		harness.advanceMs(1_000);
		await flushPromises();
		expect(loaders.localCalls).toHaveLength(2);

		harness.advanceMs(5_000);
		await flushPromises();
		expect(loaders.localCalls).toHaveLength(2);

		firstTimerLocalResult.resolve(localStatus());
		await flushPromises();
		harness.advanceMs(1_000);
		await secondTimerLocalLoaded.promise;
		await flushPromises();

		expect(loaders.localCalls).toHaveLength(3);
		pi.assertDone();
		await pi.sessionShutdown?.();
	});

	test("manual refresh after branch identity changes uses the new branch and clears stale GH state", async () => {
		const identityA = worktreeIdentity({
			head: { type: "branch", name: "feature/a" },
			headOid: "abc123",
		});
		const identityB = worktreeIdentity({
			head: { type: "branch", name: "feature/b" },
			headOid: "def456",
		});
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			identities: [queued(identityA), queued(identityB)],
			localStatuses: [
				queued(localStatus({ identity: identityA })),
				queued(
					localStatus({
						identity: identityB,
						gt: gtStatus({ commits: { type: "count", count: 2 } }),
					}),
				),
			],
			ghStatuses: [queued({ type: "no-pr" }), queued({ type: "no-pr" })],
			footerBranch: "feature/b",
		});
		const statuses = new Map<string, string | undefined>();
		const ctx = testContext(statuses);

		worktreeStatusExtension(pi as ExtensionAPI, { ...loaders, refreshIntervalMs: 60_000 });
		const command = pi.commands.get(WORKTREE_STATUS_REFRESH_COMMAND_NAME);
		expect(command).toBeDefined();
		if (command === undefined) throw new Error("expected manual refresh command");
		await pi.sessionStart?.({}, ctx);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
		);

		await command.handler("", ctx);

		expect(loaders.ghCalls.map((call) => call.identity?.head)).toEqual([
			{ type: "branch", name: "feature/a" },
			{ type: "branch", name: "feature/b" },
		]);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[gt] ↓ main · ↑ - · 2 commits\n[gh] no PR",
		);
		pi.assertDone();
		await pi.sessionShutdown?.();
	});
});

function testContext(statuses?: Map<string, string | undefined>): ExtensionContext {
	return {
		cwd: "/repo",
		hasUI: true,
		ui: {
			theme: TEST_THEME,
			setStatus(key, value) {
				statuses?.set(key, value);
			},
			setWidget() {},
		},
	};
}
