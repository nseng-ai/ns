import { writeFileSync } from "node:fs";
import { join } from "node:path";

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
	step,
	type ScriptedExec,
	TEST_THEME,
} from "./worktree-status-test-support.ts";
import worktreeStatusExtension, {
	WORKTREE_STATUS_REFRESH_COMMAND_NAME,
	type ExtensionAPI,
	type ExtensionContext,
} from "../src/worktree-status.ts";

function localRefreshSteps(
	options: {
		dirtyChecked?: (() => void) | undefined;
		base?: string | undefined;
		count?: number | undefined;
		dirtyStdout?: string | undefined;
		oid?: string | undefined;
	} = {},
): ScriptedExec[] {
	return [
		brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
		revListStep(options.base ?? "main", options.count ?? 1),
		{
			...dirtyStep(options.dirtyStdout ?? ""),
			...(options.dirtyChecked === undefined ? {} : { onCall: options.dirtyChecked }),
		},
		headOidStep(options.oid ?? "abc123"),
	];
}

describe("worktree status refresh timer", () => {
	test("startup refreshes immediately and timer refreshes after the active interval", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			vi.useFakeTimers();
			try {
				const timerDirtyChecked = deferred<void>();
				const pi = new LifecycleFakePi([
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...ghNoPrSteps(),
					...basicGitStatusScript(),
					...localRefreshSteps({ dirtyChecked: () => timerDirtyChecked.resolve() }),
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

				worktreeStatusExtension(pi as ExtensionAPI, { refreshIntervalMs: 1_000 });
				await pi.sessionStart?.({}, ctx);
				expect(pi.calls.filter((call) => call.command === "brmem")).toHaveLength(1);
				expect(pi.calls.filter((call) => call.command === "gh")).toHaveLength(1);

				await vi.advanceTimersByTimeAsync(1_000);
				await timerDirtyChecked.promise;
				await flushPromises();

				expect(pi.errors).toEqual([]);
				expect(pi.calls.filter((call) => call.command === "brmem")).toHaveLength(2);
				expect(pi.calls.filter((call) => call.command === "gh")).toHaveLength(1);
				pi.assertDone();
				await pi.sessionShutdown?.();
			} finally {
				vi.useRealTimers();
			}
		});
	});

	test("timer waits for an in-flight refresh before scheduling the next tick", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			vi.useFakeTimers();
			try {
				const firstDirtyResult = deferred<Partial<{ stdout: string }>>();
				const secondDirtyChecked = deferred<void>();
				const pi = new LifecycleFakePi([
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...ghNoPrSteps(),
					...basicGitStatusScript(),
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					revListStep("main", 1),
					step("git", ["status", "--porcelain=v1"], firstDirtyResult.promise),
					headOidStep(),
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					revListStep("main", 1),
					{ ...dirtyStep(), onCall: () => secondDirtyChecked.resolve() },
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

				worktreeStatusExtension(pi as ExtensionAPI, { refreshIntervalMs: 1_000 });
				await pi.sessionStart?.({}, ctx);
				await vi.advanceTimersByTimeAsync(1_000);
				await flushPromises();
				expect(pi.calls.filter((call) => call.command === "brmem")).toHaveLength(2);

				await vi.advanceTimersByTimeAsync(5_000);
				await flushPromises();
				expect(pi.calls.filter((call) => call.command === "brmem")).toHaveLength(2);

				firstDirtyResult.resolve({ stdout: "" });
				await flushPromises();
				await vi.advanceTimersByTimeAsync(1_000);
				await secondDirtyChecked.promise;
				await flushPromises();

				expect(pi.errors).toEqual([]);
				expect(pi.calls.filter((call) => call.command === "brmem")).toHaveLength(3);
				await pi.sessionShutdown?.();
			} finally {
				vi.useRealTimers();
			}
		});
	});

	test("manual refresh after branch identity changes uses the new branch and clears stale GH state", async () => {
		await withTempRoot(
			makeGraphiteRepo("feature/a", [
				{ branchName: "main", children: ["feature/a", "feature/b"], validationResult: "TRUNK" },
				{ branchName: "feature/a", parentBranchName: "main" },
				{ branchName: "feature/b", parentBranchName: "main" },
			]),
			async (root) => {
				const gitDir = join(root, ".git");
				const pi = new LifecycleFakePi([
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...ghNoPrSteps("feature/a"),
					...basicGitStatusScript("main", 1, "", "abc123"),
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...ghNoPrSteps("feature/b"),
					...basicGitStatusScript("main", 2, "", "def456"),
					...ghNoPrSteps("feature/b"),
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
				const command = pi.commands.get(WORKTREE_STATUS_REFRESH_COMMAND_NAME);
				expect(command).toBeDefined();
				if (command === undefined) throw new Error("expected manual refresh command");
				await pi.sessionStart?.({}, ctx);
				expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
					"[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
				);

				writeFileSync(join(gitDir, "HEAD"), "ref: refs/heads/feature/b\n");
				await command.handler("", ctx);

				expect(pi.errors).toEqual([]);
				expect(
					pi.calls.some((call) => call.args.some((arg) => arg === "headRefName=feature/b")),
				).toBe(true);
				expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
					"[gt] ↓ main · ↑ - · 2 commits\n[gh] no PR",
				);
				pi.assertDone();
				await pi.sessionShutdown?.();
			},
		);
	});
});
