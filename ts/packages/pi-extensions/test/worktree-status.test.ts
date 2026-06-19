import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { describe, expect, test } from "vitest";

import { visibleWidth } from "@earendil-works/pi-tui";

import { stripTerminalEscapes } from "@asdl/core/exec";
import { githubWorktreePrStatusQuery } from "@asdl/core/github-status";
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
	RegistrationFakePi,
	remoteOriginStep,
	revListStep,
	step,
	TEST_THEME,
} from "./worktree-status-test-support.ts";
import worktreeStatusExtension, {
	WORKTREE_STATUS_REFRESH_COMMAND_NAME,
	type ExtensionAPI,
	type ExtensionContext,
} from "../src/worktree-status.ts";

describe("worktree status extension registration and rendering", () => {
	test("registers startup/shutdown hooks and a manual refresh command", () => {
		const pi = new RegistrationFakePi();
		worktreeStatusExtension(pi as ExtensionAPI);

		expect(pi.commands).toEqual([WORKTREE_STATUS_REFRESH_COMMAND_NAME]);
		expect(pi.renderers).toEqual(["worktree-status"]);
		expect(pi.events).toEqual([
			"input",
			"user_bash",
			"agent_start",
			"agent_end",
			"turn_start",
			"turn_end",
			"message_start",
			"message_end",
			"tool_execution_start",
			"tool_execution_end",
			"model_select",
			"thinking_level_select",
			"session_start",
			"session_shutdown",
		]);
	});

	test("sets brmem and gt footer status on separate lines", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new LifecycleFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: {
							entries: [
								{
									namespace: "branch-context",
									key: "model-only-checkpoint-message-text-generation.md",
								},
							],
						},
					}),
				}),
				...ghNoPrSteps(),
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
								{
									namespace: "session-artifacts",
									key: "handoffs/resume-resource-audit-session.md",
								},
							],
						},
					}),
				}),
				...ghNoPrSteps(),
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

	test("paints local status before slow gh status resolves", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const ghResult = deferred<Partial<ExecResult>>();
			const localDirtyChecked = deferred<void>();
			const pi = new LifecycleFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				revListStep("main", 1),
				{ ...dirtyStep(), onCall: () => localDirtyChecked.resolve() },
				headOidStep(),
				remoteOriginStep(),
				step(
					"gh",
					[
						"api",
						"graphql",
						"-f",
						`query=${githubWorktreePrStatusQuery}`,
						"-f",
						"owner=dagster-io",
						"-f",
						"repo=asdl-tools",
						"-f",
						"headRefName=feature/current",
					],
					ghResult.promise,
				),
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
			const sessionStart = pi.sessionStart?.({}, ctx);
			await localDirtyChecked.promise;
			await flushPromises();

			const earlyStatus = stripTerminalEscapes(statuses.get("worktree-status") ?? "");

			ghResult.resolve({
				stdout: JSON.stringify({ data: { repository: { pullRequests: { nodes: [] } } } }),
			});
			await sessionStart;
			pi.assertDone();
			await pi.sessionShutdown?.();

			expect(earlyStatus).toBe("[gt] ↓ main · ↑ - · 1 commit\n[gh] checking…");
		});
	});

	test("initial refresh starts remote work before full local status completes", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const dirtyResult = deferred<Partial<ExecResult>>();
			const ghStarted = deferred<void>();
			const pi = new LifecycleFakePi([
				headOidStep(),
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				revListStep("main", 1),
				step("git", ["status", "--porcelain=v1"], dirtyResult.promise),
				remoteOriginStep(),
				{
					...step(
						"gh",
						[
							"api",
							"graphql",
							"-f",
							`query=${githubWorktreePrStatusQuery}`,
							"-f",
							"owner=dagster-io",
							"-f",
							"repo=asdl-tools",
							"-f",
							"headRefName=feature/current",
						],
						{ stdout: JSON.stringify({ data: { repository: { pullRequests: { nodes: [] } } } }) },
					),
					onCall: () => ghStarted.resolve(),
				},
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
			const sessionStart = pi.sessionStart?.({}, ctx);
			await ghStarted.promise;
			dirtyResult.resolve({ stdout: "" });
			await sessionStart;

			pi.assertDone();
			await pi.sessionShutdown?.();
		});
	});

	test("custom footer reads cwd branch from worktree instead of stale footer data", async () => {
		await withTempRoot(
			makeGraphiteRepo("current-branch", [
				{ branchName: "main", children: ["current-branch"], validationResult: "TRUNK" },
				{ branchName: "current-branch", parentBranchName: "main" },
			]),
			async (root) => {
				const pi = new LifecycleFakePi([
					brmemListStep({
						stdout: JSON.stringify({
							exit_code: 0,
							data: { entries: [] },
						}),
					}),
					...ghNoPrSteps("current-branch"),
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

				const footer = footerFactory({ requestRender() {} }, TEST_THEME, {
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
				});

				const footerLines = footer.render(200).map(stripTerminalEscapes);
				expect(footerLines[0]).toBe(
					`[wt] repo:${basename(root)} wt:no-slot pwd:${root} | br:current-branch ↓:main commits:1 ↑:-`,
				);
				expect(footerLines[0]).not.toContain("stale-branch");
				await pi.sessionShutdown?.();
			},
		);
	});

	test("custom footer formats slot identity and truncates nested path before branch", async () => {
		const tempRoot = mkdtempSync(join(tmpdir(), "worktree-status-slots-"));
		await withTempRoot(tempRoot, async (root) => {
			const worktreeRoot = join(root, ".slots", "repos", "asdl-tools", "worktrees", "slot-02");
			const nestedCwd = join(worktreeRoot, "ts", "界面", "pi-extensions");
			mkdirSync(join(worktreeRoot, ".git"), { recursive: true });
			mkdirSync(nestedCwd, { recursive: true });
			writeFileSync(join(worktreeRoot, ".git", "HEAD"), "ref: refs/heads/feature/slot-identity\n");
			const pi = new LifecycleFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				...ghNoPrSteps("feature/slot-identity"),
				dirtyStep(" M file.txt\n"),
				headOidStep(),
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

			const footer = footerFactory({ requestRender() {} }, TEST_THEME, {
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
			});

			const wideFooterRaw = footer.render(200)[0] ?? "";
			const truecolorPrefix = "\x1B[38;" + "2";
			expect(wideFooterRaw).not.toContain(truecolorPrefix);
			expect(wideFooterRaw).toContain("\x1B[36masdl-tools\x1B[39m");
			expect(wideFooterRaw).toContain("\x1B[36mslot-02\x1B[39m");
			expect(wideFooterRaw).toContain("\x1B[36mts/界面/pi-extensions\x1B[39m");
			expect(wideFooterRaw).toContain("\x1B[31m✗\x1B[39m");
			const wideFooterLines = [wideFooterRaw].map(stripTerminalEscapes);
			expect(wideFooterLines[0]).toBe(
				"[wt] repo:asdl-tools wt:slot-02 pwd:ts/界面/pi-extensions (✗) | br:feature/slot-identity ↓:- commits:? ↑:-",
			);
			expect(wideFooterLines[0]).not.toContain("hidden-session-name");
			expect(wideFooterLines[0]).not.toContain("stale-branch");
			const narrowIdentityRaw = footer.render(46)[0] ?? "";
			const narrowIdentity = stripTerminalEscapes(narrowIdentityRaw);
			expect(narrowIdentity).toContain("[wt] repo:asdl-tools wt:slot-02");
			expect(narrowIdentity).toContain("...");
			expect(visibleWidth(narrowIdentityRaw)).toBeLessThanOrEqual(46);
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
				...ghNoPrSteps(),
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

			const footer = footerFactory({ requestRender() {} }, TEST_THEME, {
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
			});

			expect(
				footer
					.render(200)
					.map(stripTerminalEscapes)
					.some((line) => line.includes("?/272k (auto)")),
			).toBe(true);
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
				...ghNoPrSteps(),
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

			const footer = footerFactory({ requestRender() {} }, TEST_THEME, {
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
			});

			const footerLines = footer.render(200).map(stripTerminalEscapes);
			expect(footerLines[0]).toBe(
				`[wt] repo:${basename(root)} wt:no-slot pwd:${root} | br:feature/current ↓:main commits:1 ↑:-`,
			);
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
