import { basename } from "node:path";

import { describe, expect, test } from "vitest";

import { visibleWidth } from "@earendil-works/pi-tui";

import { stripTerminalEscapes } from "@asdl/core/exec";
import { createManualTimerHarness } from "@asdl/core/testing";
import type { WorktreeGhStatus } from "@asdl/ccc/worktree-status";
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
			"[wt] repo:repo wt:no-slot pwd:/repo | br:current-branch ↓:main commits:1 ↑:-",
		);
		expect(footerLines[0]).not.toContain("stale-branch");
		await pi.sessionShutdown?.();
	});

	test("custom footer shows gh refresh countdown and resets after manual refresh", async () => {
		const harness = createManualTimerHarness();
		const availableGhStatus: WorktreeGhStatus = {
			type: "available",
			prNumber: 1907,
			threads: { unresolved: 0, total: 1, hasMore: false },
			checks: { passing: 0, pending: 4, failing: 0, unknown: 0 },
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
			"[gh] #1907 · comments 1/1 · actions 4⏳ · refresh 10s",
		);

		harness.advanceMs(5_000);
		await flushPromises();
		expect(renderRequestCount).toBeGreaterThan(0);
		expect(footer.render(200).map(stripTerminalEscapes)).toContain(
			"[gh] #1907 · comments 1/1 · actions 4⏳ · refresh 5s",
		);

		await command.handler("", ctx);

		expect(footer.render(200).map(stripTerminalEscapes)).toContain(
			"[gh] #1907 · comments 1/1 · actions 4⏳ · refresh 10s",
		);
		pi.assertDone();
		await pi.sessionShutdown?.();
	});

	test("custom footer formats slot identity and truncates nested path before branch", async () => {
		const worktreeRoot = "/tmp/.slots/repos/asdl-tools/worktrees/slot-02";
		const nestedCwd = `${worktreeRoot}/ts/界面/pi-extensions`;
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
			footerBranch: "feature/slot-identity",
			localStatuses: [
				queued(
					localStatus({
						identity: worktreeIdentity({
							cwd: worktreeRoot,
							head: { type: "branch", name: "feature/slot-identity" },
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
		const footer = footerFactory(
			{ requestRender() {} },
			TEST_THEME,
			footerData(statuses, "stale-branch"),
		);

		const wideFooterRaw = footer.render(200)[0] ?? "";
		expect(wideFooterRaw).toContain("\x1B[36masdl-tools\x1B[39m");
		expect(wideFooterRaw).toContain("\x1B[36mslot-02\x1B[39m");
		expect(wideFooterRaw).toContain("\x1B[36mts/界面/pi-extensions\x1B[39m");
		expect(wideFooterRaw).toContain("\x1B[31m✗\x1B[39m");
		const wideFooter = stripTerminalEscapes(wideFooterRaw);
		expect(wideFooter).toBe(
			"[wt] repo:asdl-tools wt:slot-02 pwd:ts/界面/pi-extensions (✗) | br:feature/slot-identity ↓:- commits:? ↑:-",
		);
		expect(wideFooter).not.toContain("stale-branch");
		const narrowIdentityRaw = footer.render(46)[0] ?? "";
		const narrowIdentity = stripTerminalEscapes(narrowIdentityRaw);
		expect(narrowIdentity).toContain("[wt] repo:asdl-tools wt:slot-02");
		expect(narrowIdentity).toContain("...");
		expect(visibleWidth(narrowIdentityRaw)).toBeLessThanOrEqual(46);
		await pi.sessionShutdown?.();
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
					["sdl-submit", "/sdl:submit running CLI command (23s)"],
				]);
			},
		});

		const footerLines = footer.render(200).map(stripTerminalEscapes);
		expect(footerLines[0]).toBe(
			`[wt] repo:${basename("/repo")} wt:no-slot pwd:/repo | br:feature/current ↓:main commits:1 ↑:-`,
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
