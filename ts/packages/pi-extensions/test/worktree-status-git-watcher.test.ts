import { mkdirSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

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
	type ScriptedExec,
	TEST_THEME,
} from "./worktree-status-test-support.ts";
import worktreeStatusExtension, {
	type ExtensionAPI,
	type ExtensionContext,
} from "../src/worktree-status.ts";

describe("worktree status git watcher", () => {
	test("git metadata watcher refreshes stale dirty marker after checkpoint commit", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			vi.useFakeTimers();
			try {
				const watched: Array<{ path: string; callback: () => void }> = [];
				const closed: string[] = [];
				const secondDirtyChecked = deferred<void>();
				const pi = new LifecycleFakePi([
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...ghNoPrSteps(),
					...basicGitStatusScript("main", 1, " M file.txt\n", "abc123"),
					brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
					...ghNoPrSteps(),
					...ghNoPrSteps(),
					revListStep("main", 2),
					{ ...dirtyStep(), onCall: () => secondDirtyChecked.resolve() },
					headOidStep("def456"),
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

				worktreeStatusExtension(pi as ExtensionAPI, {
					watchPath(path, callback) {
						watched.push({ path, callback });
						return {
							close() {
								closed.push(path);
							},
						};
					},
				});
				await pi.sessionStart?.({}, ctx);
				expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
					"[gt] ↓ main · ↑ - · 1 commit · ✗\n[gh] no PR",
				);

				expect(watched.some((entry) => entry.path.endsWith("HEAD"))).toBe(true);
				watched[0]?.callback();
				await vi.advanceTimersByTimeAsync(100);
				await secondDirtyChecked.promise;
				await flushPromises();

				expect(pi.errors).toEqual([]);
				const refreshedStatus = stripTerminalEscapes(statuses.get("worktree-status") ?? "");
				expect(refreshedStatus).toContain("[gt] ↓ main · ↑ - · 2 commits");
				expect(refreshedStatus).not.toContain("✗");
				await pi.sessionShutdown?.();
				expect(closed.length).toBeGreaterThan(0);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	test("git metadata watcher ignores self-written index and reflog paths", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const gitDir = join(root, ".git");
			// Materialize the paths the original watcher subscribed to. `git status` (run on
			// every refresh) rewrites `index`, and every git operation churns `logs/*`;
			// watching either turned the refresh into a self-triggering feedback loop. They
			// must stay excluded even when present on disk.
			mkdirSync(join(gitDir, "logs", "refs", "heads", "feature"), { recursive: true });
			mkdirSync(join(gitDir, "refs", "heads", "feature"), { recursive: true });
			writeFileSync(join(gitDir, "index"), "");
			writeFileSync(join(gitDir, "logs", "HEAD"), "");
			writeFileSync(join(gitDir, "logs", "refs", "heads", "feature", "current"), "");
			writeFileSync(join(gitDir, "refs", "heads", "feature", "current"), "abc123\n");
			writeFileSync(join(gitDir, "packed-refs"), "");

			const watched: string[] = [];
			const pi = new LifecycleFakePi([
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

			worktreeStatusExtension(pi as ExtensionAPI, {
				watchPath(path) {
					watched.push(path);
					return { close() {} };
				},
			});
			await pi.sessionStart?.({}, ctx);
			pi.assertDone();

			// Watches the commit/ref-update signals our read-only refresh never writes.
			expect(watched).toContain(join(gitDir, "HEAD"));
			expect(watched).toContain(join(gitDir, "refs", "heads", "feature", "current"));
			expect(watched).toContain(join(gitDir, "packed-refs"));
			// Never watches the self-written / high-churn paths.
			expect(watched.some((path) => path.endsWith(`${sep}index`))).toBe(false);
			expect(watched.some((path) => path.split(sep).includes("logs"))).toBe(false);
			await pi.sessionShutdown?.();
		});
	});

	test("git metadata watcher re-plans when refreshed identity switches branches", async () => {
		await withTempRoot(
			makeGraphiteRepo("feature/a", [
				{ branchName: "main", children: ["feature/a", "feature/b"], validationResult: "TRUNK" },
				{ branchName: "feature/a", parentBranchName: "main" },
				{ branchName: "feature/b", parentBranchName: "main" },
			]),
			async (root) => {
				vi.useFakeTimers();
				try {
					const gitDir = join(root, ".git");
					mkdirSync(join(gitDir, "refs", "heads", "feature"), { recursive: true });
					writeFileSync(join(gitDir, "refs", "heads", "feature", "a"), "abc123\n");
					writeFileSync(join(gitDir, "refs", "heads", "feature", "b"), "def456\n");
					writeFileSync(join(gitDir, "packed-refs"), "");

					const watched: Array<{ path: string; callback: () => void }> = [];
					const closed: string[] = [];
					const branchBDirtyChecked = deferred<void>();
					const branchBSecondDirtyChecked = deferred<void>();
					const pi = new LifecycleFakePi([
						brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
						...ghNoPrSteps("feature/a"),
						...basicGitStatusScript("main", 1, "", "abc123"),
						headOidStep("def456"),
						brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
						...ghNoPrSteps("feature/b"),
						revListStep("main", 2),
						{ ...dirtyStep(), onCall: () => branchBDirtyChecked.resolve() },
						...ghNoPrSteps("feature/b"),
						headOidStep("ghi789"),
						brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
						...ghNoPrSteps("feature/b"),
						revListStep("main", 3),
						{ ...dirtyStep(), onCall: () => branchBSecondDirtyChecked.resolve() },
						...ghNoPrSteps("feature/b"),
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

					worktreeStatusExtension(pi as ExtensionAPI, {
						watchPath(path, callback) {
							watched.push({ path, callback });
							return {
								close() {
									closed.push(path);
								},
							};
						},
					});
					await pi.sessionStart?.({}, ctx);

					expect(watched.some((entry) => entry.path.endsWith(`${sep}feature${sep}a`))).toBe(true);
					writeFileSync(join(gitDir, "HEAD"), "ref: refs/heads/feature/b\n");
					watched.find((entry) => entry.path.endsWith("HEAD"))?.callback();
					await vi.advanceTimersByTimeAsync(100);
					await branchBDirtyChecked.promise;
					await flushPromises();

					expect(closed.some((path) => path.endsWith(`${sep}feature${sep}a`))).toBe(true);
					expect(watched.some((entry) => entry.path.endsWith(`${sep}feature${sep}b`))).toBe(true);

					await vi.advanceTimersByTimeAsync(250);
					writeFileSync(join(gitDir, "refs", "heads", "feature", "b"), "ghi789\n");
					watched.find((entry) => entry.path.endsWith(`${sep}feature${sep}b`))?.callback();
					await vi.advanceTimersByTimeAsync(100);
					await branchBSecondDirtyChecked.promise;
					await flushPromises();

					expect(pi.errors).toEqual([]);
					expect(
						pi.calls.filter((call) => call.args.some((arg) => arg === "headRefName=feature/b"))
							.length,
					).toBeGreaterThanOrEqual(2);
					await pi.sessionShutdown?.();
				} finally {
					vi.useRealTimers();
				}
			},
		);
	});

	test("git metadata watcher defers events during cooldown into one coalesced rerun", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			vi.useFakeTimers();
			try {
				const watched: Array<{ path: string; callback: () => void }> = [];
				const refresh1Dirty = deferred<void>();
				const refresh2Dirty = deferred<void>();
				const emptyBrmem = { stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) };
				const refreshSteps = (dirtyChecked: () => void): ScriptedExec[] => [
					brmemListStep(emptyBrmem),
					revListStep("main", 1),
					{ ...dirtyStep(), onCall: dirtyChecked },
					headOidStep(),
				];
				const pi = new LifecycleFakePi([
					// Initial startup refresh.
					brmemListStep(emptyBrmem),
					...ghNoPrSteps(),
					...basicGitStatusScript(),
					// Watcher refresh #1.
					...refreshSteps(() => refresh1Dirty.resolve()),
					// Watcher refresh #2 — the single coalesced rerun of every cooldown event.
					...refreshSteps(() => refresh2Dirty.resolve()),
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

				worktreeStatusExtension(pi as ExtensionAPI, {
					watchPath(path, callback) {
						watched.push({ path, callback });
						return { close() {} };
					},
				});
				await pi.sessionStart?.({}, ctx);
				const brmemCount = (): number => pi.calls.filter((call) => call.command === "brmem").length;
				expect(brmemCount()).toBe(1);

				// First event runs refresh #1 to completion, leaving the watcher in cooldown.
				watched[0]?.callback();
				await vi.advanceTimersByTimeAsync(100); // debounce
				await refresh1Dirty.promise;
				await flushPromises();
				expect(brmemCount()).toBe(2);

				// Several events arriving during the cooldown window must not each spawn a
				// refresh — they collapse into one pending rerun.
				watched[0]?.callback();
				watched[0]?.callback();
				watched[0]?.callback();
				await vi.advanceTimersByTimeAsync(100); // debounce elapses, cooldown still active
				await flushPromises();
				expect(brmemCount()).toBe(2);

				// Cooldown elapses → exactly one coalesced rerun fires.
				await vi.advanceTimersByTimeAsync(250); // cooldown
				await refresh2Dirty.promise;
				await flushPromises();

				expect(pi.errors).toEqual([]);
				expect(brmemCount()).toBe(3);
				pi.assertDone();
				await pi.sessionShutdown?.();
			} finally {
				vi.useRealTimers();
			}
		});
	});
});
