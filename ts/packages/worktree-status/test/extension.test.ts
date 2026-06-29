import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { describe, expect, test } from "vitest";

import { visibleWidth } from "@earendil-works/pi-tui";

import { stripTerminalEscapes } from "@sdl/core/terminal-escapes";
import { createManualTimerHarness } from "@sdl/core/testing";
import type { WorktreeGhStatus } from "@sdl/worktree-status";
import {
	deferred,
	fakeWorktreeStatusLoaders,
	flushPromises,
	gtStatus,
	LifecycleFakePi,
	localStatus,
	queued,
	RegistrationFakePi,
	TEST_THEME,
	worktreeIdentity,
} from "./test-support.ts";
import worktreeStatusExtension, {
	WORKTREE_STATUS_REFRESH_COMMAND_NAME,
	type ExtensionAPI,
	type ExtensionContext,
} from "../src/extension.ts";

describe("worktree status extension registration and rendering", () => {
	test("registers startup/shutdown hooks and a manual refresh command", () => {
		const pi = new RegistrationFakePi();
		worktreeStatusExtension(pi as ExtensionAPI);

		expect(pi.commands).toEqual([WORKTREE_STATUS_REFRESH_COMMAND_NAME]);
		expect(pi.renderers).toEqual(["worktree-status"]);
		expect(pi.registeredEvents).toEqual([
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

	test("sets brmem, gt, and gh footer status on separate lines", async () => {
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(
					localStatus({
						brmem: "(branch-context: model-only-checkpoint-message-text-generation.md)",
					}),
				),
			],
		});
		const statuses = new Map<string, string | undefined>();
		const ctx = testContext({ statuses });

		worktreeStatusExtension(pi as ExtensionAPI, { loaders });
		await pi.sessionStart?.({}, ctx);

		pi.assertDone();
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[brmem] (branch-context: model-only-checkpoint-message-text-generation.md)\n[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
		);
		expect(loaders.localCalls).toHaveLength(1);
		expect(loaders.ghCalls).toHaveLength(1);
		await pi.sessionShutdown?.();
	});

	test("manual refresh command refreshes stale GitHub head-mismatch status", async () => {
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			ghStatuses: [
				queued({
					type: "head-mismatch",
					prNumber: 1795,
					url: "https://github.com/dagster-io/asdl-tools/pull/1795",
					threads: { unresolved: 0, total: 0, hasMore: false },
					checks: { passing: 0, pending: 0, failing: 0, unknown: 0, hasMore: false },
					prHeadOid: "stale-pr-head",
				}),
				queued({
					type: "available",
					prNumber: 1795,
					url: "https://github.com/dagster-io/asdl-tools/pull/1795",
					threads: { unresolved: 0, total: 0, hasMore: false },
					checks: { passing: 0, pending: 0, failing: 0, unknown: 0, hasMore: false },
				}),
			],
		});
		const statuses = new Map<string, string | undefined>();
		const ctx = testContext({ statuses });

		worktreeStatusExtension(pi as ExtensionAPI, { loaders });
		await pi.sessionStart?.({}, ctx);
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toContain(
			"[gh] #1795 · comments 0/0 · checks 0✓ · PR behind local",
		);
		const command = pi.commands.get(WORKTREE_STATUS_REFRESH_COMMAND_NAME);
		expect(command).toBeDefined();
		if (command === undefined) throw new Error("expected manual refresh command");

		await command.handler("", ctx);

		pi.assertDone();
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toContain(
			"[gh] #1795 · comments 0/0 · checks 0✓ · landable",
		);
		expect(loaders.ghCalls).toHaveLength(2);
		await pi.sessionShutdown?.();
	});

	test("renders singular handoff footer scope before gt on the next line", async () => {
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(
					localStatus({
						brmem:
							"(handoff: document-local-github-pull-guidance.md, routing-docs-close-objective.md) (session-artifacts: handoffs)",
					}),
				),
			],
		});
		const statuses = new Map<string, string | undefined>();
		const ctx = testContext({ statuses });

		worktreeStatusExtension(pi as ExtensionAPI, { loaders });
		await pi.sessionStart?.({}, ctx);

		pi.assertDone();
		expect(stripTerminalEscapes(statuses.get("worktree-status") ?? "")).toBe(
			"[brmem] (handoff: document-local-github-pull-guidance.md, routing-docs-close-objective.md) (session-artifacts: handoffs)\n[gt] ↓ main · ↑ - · 1 commit\n[gh] no PR",
		);
		await pi.sessionShutdown?.();
	});

	test("paints local status before slow gh status resolves", async () => {
		const ghResult = deferred<WorktreeGhStatus>();
		const localLoaded = deferred<void>();
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [queued(localStatus(), () => localLoaded.resolve())],
			ghStatuses: [queued(ghResult.promise)],
		});
		const statuses = new Map<string, string | undefined>();
		const ctx = testContext({ statuses });

		worktreeStatusExtension(pi as ExtensionAPI, { loaders });
		const sessionStart = pi.sessionStart?.({}, ctx);
		await localLoaded.promise;
		await flushPromises();
		const earlyStatus = stripTerminalEscapes(statuses.get("worktree-status") ?? "");

		ghResult.resolve({ type: "no-pr" });
		await sessionStart;

		pi.assertDone();
		expect(earlyStatus).toBe("[gt] ↓ main · ↑ - · 1 commit\n[gh] checking…");
		await pi.sessionShutdown?.();
	});

	test("initial refresh starts remote work before full local status completes", async () => {
		const localResult = deferred<ReturnType<typeof localStatus>>();
		const ghStarted = deferred<void>();
		const pi = new LifecycleFakePi([]);
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [queued(localResult.promise)],
			ghStatuses: [queued(Promise.resolve({ type: "no-pr" }), () => ghStarted.resolve())],
		});
		const ctx = testContext();

		worktreeStatusExtension(pi as ExtensionAPI, { loaders });
		const sessionStart = pi.sessionStart?.({}, ctx);
		await ghStarted.promise;
		localResult.resolve(localStatus());
		await sessionStart;

		pi.assertDone();
		expect(loaders.ghCalls).toHaveLength(1);
		await pi.sessionShutdown?.();
	});

	test("custom footer reads cwd branch from injected worktree reader instead of stale footer data", async () => {
		const pi = new LifecycleFakePi([]);
		const statuses = new Map<string, string>();
		let footerFactory: Parameters<NonNullable<ExtensionContext["ui"]["setFooter"]>>[0];
		const ctx = testContext({
			statuses,
			setFooter(factory) {
				footerFactory = factory;
			},
			sessionCwd: "/repo",
			model: { id: "test-model", contextWindow: 272000 },
			contextUsage: { contextWindow: 272000, percent: 18.2 },
		});
		const loaders = fakeWorktreeStatusLoaders({
			footerBranch: "current-branch",
			identities: [queued(worktreeIdentity({ head: { type: "branch", name: "current-branch" } }))],
			localStatuses: [
				queued(
					localStatus({
						identity: worktreeIdentity({ head: { type: "branch", name: "current-branch" } }),
					}),
				),
			],
		});

		worktreeStatusExtension(pi as ExtensionAPI, { loaders });
		await pi.sessionStart?.({}, ctx);

		pi.assertDone();
		expect(footerFactory).toBeDefined();
		if (footerFactory === undefined) throw new Error("expected custom footer factory");
		const footer = footerFactory(
			{ requestRender() {} },
			TEST_THEME,
			footerData(statuses, "stale-branch"),
		);
		const footerLines = footer.render(200).map(stripTerminalEscapes);
		expect(footerLines[0]).toBe(
			"[wt] repo:repo wt:root pwd:/repo | br:current-branch ↓:main commits:1 ↑:-",
		);
		expect(footerLines[0]).not.toContain("stale-branch");
		await pi.sessionShutdown?.();
	});

	test("custom footer shows gh refresh freshness age and resets after manual refresh", async () => {
		const harness = createManualTimerHarness();
		const availableGhStatus: WorktreeGhStatus = {
			type: "available",
			prNumber: 1907,
			threads: { unresolved: 0, total: 1, hasMore: false },
			checks: { passing: 0, pending: 4, failing: 0, unknown: 0, hasMore: false },
		};
		const pi = new LifecycleFakePi([]);
		const statuses = new Map<string, string>();
		let footerFactory: Parameters<NonNullable<ExtensionContext["ui"]["setFooter"]>>[0];
		let renderRequestCount = 0;
		const ctx = testContext({
			statuses,
			setFooter(factory) {
				footerFactory = factory;
			},
			model: { id: "test-model", contextWindow: 272000 },
		});
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [queued(localStatus()), queued(localStatus())],
			ghStatuses: [queued(availableGhStatus), queued(availableGhStatus)],
		});

		worktreeStatusExtension(pi as ExtensionAPI, {
			loaders,
			timers: harness.timers,
			clock: harness.clock,
		});
		const command = pi.commands.get(WORKTREE_STATUS_REFRESH_COMMAND_NAME);
		expect(command).toBeDefined();
		if (command === undefined) throw new Error("expected manual refresh command");
		await pi.sessionStart?.({}, ctx);

		expect(footerFactory).toBeDefined();
		if (footerFactory === undefined) throw new Error("expected custom footer factory");
		const footer = footerFactory(
			{
				requestRender() {
					renderRequestCount += 1;
				},
			},
			TEST_THEME,
			footerData(statuses, "feature/current"),
		);
		expect(footer.render(200).map(stripTerminalEscapes)).toContain(
			"[gh] #1907 · comments 1/1 · checks 4⏳ · refreshed 0s ago",
		);

		harness.advanceMs(5_000);
		await flushPromises();
		expect(renderRequestCount).toBeGreaterThan(0);
		expect(footer.render(200).map(stripTerminalEscapes)).toContain(
			"[gh] #1907 · comments 1/1 · checks 4⏳ · refreshed 5s ago",
		);

		await command.handler("", ctx);

		expect(footer.render(200).map(stripTerminalEscapes)).toContain(
			"[gh] #1907 · comments 1/1 · checks 4⏳ · refreshed 0s ago",
		);
		pi.assertDone();
		await pi.sessionShutdown?.();
	});

	test("custom footer formats generic linked worktree identity and truncates nested path before branch", async () => {
		const fixture = createLinkedWorktreeFixture("feature-wt");
		const worktreeRoot = fixture.worktreeRoot;
		const nestedCwd = join(worktreeRoot, "ts", "界面", "pi-extensions");
		mkdirSync(nestedCwd, { recursive: true });
		try {
			const pi = new LifecycleFakePi([]);
			const statuses = new Map<string, string>();
			let footerFactory: Parameters<NonNullable<ExtensionContext["ui"]["setFooter"]>>[0];
			const ctx = testContext({
				cwd: worktreeRoot,
				sessionCwd: nestedCwd,
				statuses,
				setFooter(factory) {
					footerFactory = factory;
				},
				model: { id: "test-model", contextWindow: 272000 },
			});
			const loaders = fakeWorktreeStatusLoaders({
				footerBranch: "feature/generic-worktree",
				localStatuses: [
					queued(
						localStatus({
							identity: worktreeIdentity({
								cwd: worktreeRoot,
								head: { type: "branch", name: "feature/generic-worktree" },
							}),
							gt: gtStatus({ down: "-", commits: { type: "unknown" }, dirty: "yes" }),
						}),
					),
				],
			});

			worktreeStatusExtension(pi as ExtensionAPI, { loaders });
			await pi.sessionStart?.({}, ctx);

			pi.assertDone();
			expect(footerFactory).toBeDefined();
			if (footerFactory === undefined) throw new Error("expected custom footer factory");
			const footerTheme = {
				...TEST_THEME,
				fg(color, value) {
					const code =
						color === "accent"
							? "36"
							: color === "error"
								? "31"
								: color === "warning"
									? "33"
									: "90";
					return `\x1B[${code}m${value}\x1B[39m`;
				},
			} satisfies typeof TEST_THEME;
			const footer = footerFactory(
				{ requestRender() {} },
				footerTheme,
				footerData(statuses, "stale-branch"),
			);

			const wideFooterRaw = footer.render(200)[0] ?? "";
			expect(wideFooterRaw).toContain("\x1B[36msdl-tools\x1B[39m");
			expect(wideFooterRaw).toContain("\x1B[36mfeature-wt\x1B[39m");
			expect(wideFooterRaw).toContain("\x1B[36mts/界面/pi-extensions\x1B[39m");
			expect(wideFooterRaw).toContain("\x1B[31m✗\x1B[39m");
			expect(wideFooterRaw).toContain("\x1B[33mfeature/generic-worktree\x1B[39m");
			const wideFooter = stripTerminalEscapes(wideFooterRaw);
			expect(wideFooter).toBe(
				"[wt] repo:sdl-tools wt:feature-wt pwd:ts/界面/pi-extensions (✗) | br:feature/generic-worktree ↓:- commits:? ↑:-",
			);
			expect(wideFooter).not.toContain("stale-branch");
			const narrowIdentityRaw = footer.render(46)[0] ?? "";
			const narrowIdentity = stripTerminalEscapes(narrowIdentityRaw);
			expect(narrowIdentity).toContain("[wt] repo:sdl-tools wt:feature-wt");
			expect(narrowIdentity).toContain("...");
			expect(narrowIdentityRaw).toContain("\x1B[36msdl-tools\x1B[39m");
			expect(narrowIdentityRaw).toContain("\x1B[36mfeature-wt\x1B[39m");
			expect(visibleWidth(narrowIdentityRaw)).toBeLessThanOrEqual(46);

			const branchTruncatedIdentityRaw = footer.render(80)[0] ?? "";
			expect(branchTruncatedIdentityRaw).toContain("\x1B[31m✗\x1B[39m");
			expect(branchTruncatedIdentityRaw).toContain("\x1B[33mfeature/");
			expect(stripTerminalEscapes(branchTruncatedIdentityRaw)).toContain("...");
			expect(visibleWidth(branchTruncatedIdentityRaw)).toBeLessThanOrEqual(80);
			await pi.sessionShutdown?.();
		} finally {
			rmSync(fixture.tempRoot, { recursive: true, force: true });
		}
	});

	test("custom footer formats repository root checkout as wt root and pwd dot", async () => {
		const fixture = createRootCheckoutFixture();
		const worktreeRoot = fixture.worktreeRoot;
		try {
			const pi = new LifecycleFakePi([]);
			const statuses = new Map<string, string>();
			let footerFactory: Parameters<NonNullable<ExtensionContext["ui"]["setFooter"]>>[0];
			const ctx = testContext({
				cwd: worktreeRoot,
				sessionCwd: worktreeRoot,
				statuses,
				setFooter(factory) {
					footerFactory = factory;
				},
				model: { id: "test-model", contextWindow: 272000 },
			});
			const loaders = fakeWorktreeStatusLoaders({
				footerBranch: "feature/root",
				localStatuses: [
					queued(
						localStatus({
							identity: worktreeIdentity({
								cwd: worktreeRoot,
								head: { type: "branch", name: "feature/root" },
							}),
						}),
					),
				],
			});

			worktreeStatusExtension(pi as ExtensionAPI, { loaders });
			await pi.sessionStart?.({}, ctx);

			pi.assertDone();
			expect(footerFactory).toBeDefined();
			if (footerFactory === undefined) throw new Error("expected custom footer factory");
			const footer = footerFactory(
				{ requestRender() {} },
				TEST_THEME,
				footerData(statuses, "stale-branch"),
			);

			expect(stripTerminalEscapes(footer.render(200)[0] ?? "")).toBe(
				"[wt] repo:sdl-tools wt:root pwd:. | br:feature/root ↓:main commits:1 ↑:-",
			);
			await pi.sessionShutdown?.();
		} finally {
			rmSync(fixture.tempRoot, { recursive: true, force: true });
		}
	});

	test("custom footer formats linked worktree root as pwd dot", async () => {
		const fixture = createLinkedWorktreeFixture("slot-04");
		const worktreeRoot = fixture.worktreeRoot;
		try {
			const pi = new LifecycleFakePi([]);
			const statuses = new Map<string, string>();
			let footerFactory: Parameters<NonNullable<ExtensionContext["ui"]["setFooter"]>>[0];
			const ctx = testContext({
				cwd: worktreeRoot,
				sessionCwd: worktreeRoot,
				statuses,
				setFooter(factory) {
					footerFactory = factory;
				},
				model: { id: "test-model", contextWindow: 272000 },
			});
			const loaders = fakeWorktreeStatusLoaders({
				footerBranch: "feature/generic-root",
				localStatuses: [
					queued(
						localStatus({
							identity: worktreeIdentity({
								cwd: worktreeRoot,
								head: { type: "branch", name: "feature/generic-root" },
							}),
						}),
					),
				],
			});

			worktreeStatusExtension(pi as ExtensionAPI, { loaders });
			await pi.sessionStart?.({}, ctx);

			pi.assertDone();
			expect(footerFactory).toBeDefined();
			if (footerFactory === undefined) throw new Error("expected custom footer factory");
			const footer = footerFactory(
				{ requestRender() {} },
				TEST_THEME,
				footerData(statuses, "stale-branch"),
			);

			expect(stripTerminalEscapes(footer.render(200)[0] ?? "")).toBe(
				"[wt] repo:sdl-tools wt:slot-04 pwd:. | br:feature/generic-root ↓:main commits:1 ↑:-",
			);
			await pi.sessionShutdown?.();
		} finally {
			rmSync(fixture.tempRoot, { recursive: true, force: true });
		}
	});

	test("custom footer tolerates context usage estimation failures", async () => {
		const pi = new LifecycleFakePi([]);
		const statuses = new Map<string, string>();
		let footerFactory: Parameters<NonNullable<ExtensionContext["ui"]["setFooter"]>>[0];
		const ctx = testContext({
			statuses,
			setFooter(factory) {
				footerFactory = factory;
			},
			model: { id: "test-model", contextWindow: 272000 },
			getContextUsage() {
				throw new TypeError("Cannot read properties of undefined (reading 'length')");
			},
		});

		worktreeStatusExtension(pi as ExtensionAPI, { loaders: fakeWorktreeStatusLoaders() });
		await pi.sessionStart?.({}, ctx);

		pi.assertDone();
		expect(footerFactory).toBeDefined();
		if (footerFactory === undefined) throw new Error("expected custom footer factory");
		const footer = footerFactory({ requestRender() {} }, TEST_THEME, footerData(statuses, "main"));

		expect(
			footer
				.render(200)
				.map(stripTerminalEscapes)
				.some((line) => line.includes("?/272k (auto)")),
		).toBe(true);
		await pi.sessionShutdown?.();
	});

	test("custom footer renders multiline worktree status as separate footer lines", async () => {
		const pi = new LifecycleFakePi([]);
		const statuses = new Map<string, string>();
		let footerFactory: Parameters<NonNullable<ExtensionContext["ui"]["setFooter"]>>[0];
		const ctx = testContext({
			statuses,
			setFooter(factory) {
				footerFactory = factory;
			},
			model: { id: "test-model", contextWindow: 272000 },
			contextUsage: { contextWindow: 272000, percent: 18.2 },
		});
		const loaders = fakeWorktreeStatusLoaders({
			localStatuses: [
				queued(localStatus({ brmem: "(pb-plan: handoffs-graphite-footer-lines.md)" })),
			],
		});

		worktreeStatusExtension(pi as ExtensionAPI, { loaders });
		await pi.sessionStart?.({}, ctx);

		pi.assertDone();
		expect(footerFactory).toBeDefined();
		if (footerFactory === undefined) throw new Error("expected custom footer factory");
		const footer = footerFactory({ requestRender() {} }, TEST_THEME, {
			...footerData(statuses, "handoffs-graphite-footer-lines"),
			getExtensionStatuses() {
				return new Map([
					...statuses,
					["worktree-status", "[gt] future format that should be ignored\n[gh] stale text"],
					["sdl-flow-changes", "/sdl:flow:changes running CLI command (23s)"],
				]);
			},
		});

		const footerLines = footer.render(200).map(stripTerminalEscapes);
		expect(footerLines[0]).toBe(
			`[wt] repo:${basename("/repo")} wt:root pwd:/repo | br:feature/current ↓:main commits:1 ↑:-`,
		);
		expect(footerLines[1]).toBe("[brmem] (pb-plan: handoffs-graphite-footer-lines.md)");
		expect(footerLines[2]).toBe("[gh] no PR · refreshed 0s ago");
		expect(footerLines[3]).toContain("18.2%/272k (auto)");
		expect(footerLines.at(-1)).toBe("/sdl:flow:changes running CLI command (23s)");
		expect(footerLines).not.toContain("[gt] future format that should be ignored");
		expect(footerLines).not.toContain("[gh] stale text");
		await pi.sessionShutdown?.();
	});
});

interface StatusSink {
	set(key: string, value: string | undefined): unknown;
}

interface TestContextOptions {
	cwd?: string | undefined;
	sessionCwd?: string | undefined;
	statuses?: StatusSink | undefined;
	setFooter?: NonNullable<ExtensionContext["ui"]["setFooter"]> | undefined;
	model?: ExtensionContext["model"] | undefined;
	contextUsage?: ReturnType<NonNullable<ExtensionContext["getContextUsage"]>> | undefined;
	getContextUsage?: ExtensionContext["getContextUsage"] | undefined;
}

function testContext(options: TestContextOptions = {}): ExtensionContext {
	const statuses = options.statuses;
	return {
		cwd: options.cwd ?? "/repo",
		hasUI: true,
		sessionManager: {
			getEntries() {
				return [];
			},
			getCwd() {
				return options.sessionCwd ?? options.cwd ?? "/repo";
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
		...(options.model === undefined ? {} : { model: options.model }),
		getContextUsage: options.getContextUsage ?? (() => options.contextUsage),
		ui: {
			theme: TEST_THEME,
			setStatus(key, value) {
				statuses?.set(key, value);
			},
			setWidget() {},
			...(options.setFooter === undefined ? {} : { setFooter: options.setFooter }),
		},
	};
}

interface LinkedWorktreeFixture {
	readonly tempRoot: string;
	readonly worktreeRoot: string;
}

function createRootCheckoutFixture(): LinkedWorktreeFixture {
	const tempRoot = mkdtempSync(join(tmpdir(), "sdl-worktree-footer-"));
	const worktreeRoot = join(tempRoot, "sdl-tools");
	const gitDir = join(worktreeRoot, ".git");
	mkdirSync(gitDir, { recursive: true });
	writeFileSync(join(gitDir, "HEAD"), "ref: refs/heads/feature/root\n");
	return { tempRoot, worktreeRoot };
}

function createLinkedWorktreeFixture(worktreeName: string): LinkedWorktreeFixture {
	const tempRoot = mkdtempSync(join(tmpdir(), "sdl-worktree-footer-"));
	const repoRoot = join(tempRoot, "sdl-tools");
	const commonGitDir = join(repoRoot, ".git");
	const gitDir = join(commonGitDir, "worktrees", worktreeName);
	const worktreeRoot = join(tempRoot, worktreeName);
	mkdirSync(gitDir, { recursive: true });
	mkdirSync(worktreeRoot, { recursive: true });
	writeFileSync(join(worktreeRoot, ".git"), `gitdir: ${gitDir}\n`);
	writeFileSync(join(gitDir, "HEAD"), "ref: refs/heads/feature/generic-worktree\n");
	writeFileSync(join(gitDir, "commondir"), "../..\n");
	return { tempRoot, worktreeRoot };
}

function footerData(statuses: ReadonlyMap<string, string>, branch: string) {
	return {
		getGitBranch() {
			return branch;
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
	};
}
