import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	createHerdrSidebarControllerWithPiWiring,
	registerHerdrSidebarCommands,
} from "@nseng-ai/herdr/pi";
import {
	createHerdrSidebarController,
	getCallerPaneId,
	getCallerWorkspaceId,
} from "../src/core/sidebar.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import {
	formatObjectiveSidebarLabel,
	resolveObjectiveSelector,
} from "../src/core/objective-sidebar.ts";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	makeTempDir,
	notificationMessages,
	objectiveDiffStep,
	objectiveListStep,
	objectiveReadStep,
	objectiveStatusStep,
	resetHerdrTestEnvironment,
	step,
} from "./herdr-test-harness.ts";

beforeEach(() => vi.stubEnv("HERDR_PANE_ID", "w1:p1"));
afterEach(resetHerdrTestEnvironment);

describe("herdr Objective sidebar", () => {
	test("ns:herdr:sidebar:objective-summary applies objective label and slot title", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const repoRoot = await makeTempDir();
		const slug = "herdr-capability-parity";
		const expectedLabel = `obj:${slug}`;
		const pi = new FakePi({
			script: [objectiveReadStep(slug)],
		});
		const adaptedPi = createHerdrPiCommandApi(pi);
		const herdr = new FakeHerdrGateway();
		const controller = createHerdrSidebarController(adaptedPi, herdr);
		registerHerdrSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands.get("ns:herdr:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(1);
		expect(pi.execCalls).toEqual([
			{
				command: "ns",
				args: ["objective", "exec", "read-objective", slug, "--format", "json"],
				options: { cwd: repoRoot, signal: expect.any(AbortSignal) },
			},
		]);
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: expectedLabel }]);
		expect(herdr.paneTitleCalls).toEqual([{ paneId: "w1:p1", title: repoRoot.split("/").at(-1) }]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.statuses).toEqual([
			{ key: "pi:herdr-sidebar", value: "preparing Herdr Objective sidebar…" },
			{ key: "pi:herdr-sidebar", value: undefined },
		]);
		expect(notificationMessages(ctx)).toContain(
			`Applied Herdr Objective sidebar: ${expectedLabel} / ${repoRoot.split("/").at(-1)}`,
		);
	});

	test("ns:herdr:sidebar:objective-summary resolves path selector to slug", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const repoRoot = await makeTempDir();
		const slug = "herdr-capability-parity";
		const pi = new FakePi({
			script: [objectiveReadStep(slug)],
		});
		const adaptedPi = createHerdrPiCommandApi(pi);
		const herdr = new FakeHerdrGateway();
		const controller = createHerdrSidebarController(adaptedPi, herdr);
		registerHerdrSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands
			.get("ns:herdr:sidebar:objective-summary")
			?.handler(`.ns/objectives/${slug}/objective.md`, ctx);

		pi.assertDone();
		expect(pi.execCalls[0]).toMatchObject({
			command: "ns",
			args: ["objective", "exec", "read-objective", slug, "--format", "json"],
		});
		expect(herdr.renameCalls).toHaveLength(1);
		expect(herdr.renameCalls[0]?.label).toBe(`obj:${slug}`);
		expect(pi.sentUserMessages).toEqual([]);
	});

	test("ns:herdr:sidebar:objective-summary without selector opens Objective picker", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const repoRoot = await makeTempDir();
		const slug = "bravo-objective";
		const expectedLabel = `obj:${slug}`;
		const pi = new FakePi({
			script: [
				objectiveListStep(["alpha-objective", slug]),
				objectiveDiffStep(""),
				objectiveStatusStep(""),
				objectiveReadStep(slug),
			],
		});
		const adaptedPi = createHerdrPiCommandApi(pi);
		const herdr = new FakeHerdrGateway();
		const controller = createHerdrSidebarController(adaptedPi, herdr);
		registerHerdrSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot, selectIndices: [1] });

		await pi.commands.get("ns:herdr:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(2);
		expect(ctx.selections).toEqual([
			{
				title: "Select an active Objective for Herdr sidebar",
				items: [
					"alpha-objective — open — latest update 2026-01-01T00:00:00Z",
					"bravo-objective — open — latest update 2026-01-02T00:00:00Z",
				],
			},
		]);
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: expectedLabel }]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(notificationMessages(ctx).at(-1)).toContain(
			`Applied Herdr Objective sidebar: ${expectedLabel} /`,
		);
	});

	test("ns:herdr:sidebar:objective-summary suggests the only changed active Objective", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const repoRoot = await makeTempDir();
		const slug = "bravo-objective";
		const pi = new FakePi({
			script: [
				objectiveListStep(["alpha-objective", slug, "charlie-objective"]),
				objectiveDiffStep(`M\t.ns/objectives/${slug}/objective.md\n`),
				objectiveStatusStep(""),
				objectiveReadStep(slug),
			],
		});
		const adaptedPi = createHerdrPiCommandApi(pi);
		const herdr = new FakeHerdrGateway();
		const controller = createHerdrSidebarController(adaptedPi, herdr);
		registerHerdrSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands.get("ns:herdr:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(ctx.selections).toEqual([
			{
				title: "Select an active Objective for Herdr sidebar (only Objective changed vs master)",
				items: [
					"bravo-objective — suggested: only Objective changed vs master — open — latest update 2026-01-02T00:00:00Z",
					"View other active Objectives…",
				],
			},
		]);
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: `obj:${slug}` }]);
		expect(notificationMessages(ctx).at(-1)).toContain(
			`Applied Herdr Objective sidebar: obj:${slug} /`,
		);
	});

	test("ns:herdr:sidebar:objective-summary picker cancellation stops without rename", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const pi = new FakePi({
			script: [
				objectiveListStep(["alpha-objective"]),
				objectiveDiffStep(""),
				objectiveStatusStep(""),
			],
		});
		const adaptedPi = createHerdrPiCommandApi(pi);
		const herdr = new FakeHerdrGateway();
		const controller = createHerdrSidebarController(adaptedPi, herdr);
		registerHerdrSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ shouldCancelSelect: true });

		await pi.commands.get("ns:herdr:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "Objective selection cancelled.",
			level: "info",
		});
	});

	test("ns:herdr:sidebar:objective-summary with no active Objectives stops without rename", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const pi = new FakePi({ script: [objectiveListStep([])] });
		const adaptedPi = createHerdrPiCommandApi(pi);
		const herdr = new FakeHerdrGateway();
		const controller = createHerdrSidebarController(adaptedPi, herdr);
		registerHerdrSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("ns:herdr:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.selections).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "No active Objectives. Create one with /ns:objective:create.",
			level: "info",
		});
	});

	test("ns:herdr:sidebar:objective-summary missing workspace skips all work", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", undefined);
		const pi = new FakePi();
		const adaptedPi = createHerdrPiCommandApi(pi);
		const herdr = new FakeHerdrGateway();
		const controller = createHerdrSidebarController(adaptedPi, herdr);
		registerHerdrSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands
			.get("ns:herdr:sidebar:objective-summary")
			?.handler("herdr-capability-parity", ctx);

		expect(ctx.waitCount).toBe(1);
		expect(pi.execCalls).toEqual([]);
		expect(herdr.renameCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe("Not running inside a Herdr caller workspace.");
	});

	test("ns:herdr:sidebar:objective-summary surfaces Objective read failure without rename", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const slug = "ghost-objective";
		const pi = new FakePi({
			script: [
				step("ns", ["objective", "exec", "read-objective", slug, "--format", "json"], {
					code: 1,
					stdout: JSON.stringify({
						exitCode: 1,
						message: "Objective not found",
						data: { status: "not_found" },
					}),
				}),
			],
		});
		const adaptedPi = createHerdrPiCommandApi(pi);
		const herdr = new FakeHerdrGateway();
		const controller = createHerdrSidebarController(adaptedPi, herdr);
		registerHerdrSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("ns:herdr:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Objective not found");
	});

	test("ns:herdr:sidebar:objective-summary surfaces herdr rename failure", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const repoRoot = await makeTempDir();
		const slug = "herdr-capability-parity";
		const pi = new FakePi({
			script: [objectiveReadStep(slug)],
		});
		const adaptedPi = createHerdrPiCommandApi(pi);
		const herdr = new FakeHerdrGateway({
			renameResult: { type: "failed", message: "workspace not found" },
		});
		const controller = createHerdrSidebarController(adaptedPi, herdr);
		registerHerdrSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands.get("ns:herdr:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(herdr.renameCalls).toHaveLength(1);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("workspace not found");
	});

	test("ns:herdr:sidebar:objective-summary applies the cwd slot as the caller-pane title", async () => {
		// The slot is derived without extra process I/O and reported through the
		// caller pane's metadata title, which Herdr displays beneath the workspace label.
		vi.stubEnv("HERDR_WORKSPACE_ID", "workspace-42");
		const repoRoot = await makeTempDir();
		const slug = "herdr-capability-parity";
		const pi = new FakePi({
			script: [objectiveReadStep(slug)],
		});
		const adaptedPi = createHerdrPiCommandApi(pi);
		const herdr = new FakeHerdrGateway();
		const controller = createHerdrSidebarController(adaptedPi, herdr);
		registerHerdrSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands.get("ns:herdr:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		// Only objective exec call — no git branch or slot subprocess call.
		expect(pi.execCalls).toHaveLength(1);
		expect(pi.execCalls[0]?.command).toBe("ns");
		expect(herdr.renameCalls).toEqual([
			{ workspaceId: "workspace-42", label: "obj:herdr-capability-parity" },
		]);
		expect(herdr.paneTitleCalls).toEqual([{ paneId: "w1:p1", title: repoRoot.split("/").at(-1) }]);
	});

	test("ns:herdr:sidebar:objective-summary uses Pi wiring end-to-end", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const pi = new FakePi();
		const controller = createHerdrSidebarControllerWithPiWiring(pi);
		registerHerdrSidebarCommands(pi, controller);
		expect(pi.commands.has("ns:herdr:sidebar:objective-summary")).toBe(true);
	});
});

describe("herdr Objective sidebar — caller IDs", () => {
	test("reads HERDR_WORKSPACE_ID from injected env", () => {
		expect(getCallerWorkspaceId({ HERDR_WORKSPACE_ID: "w42" })).toBe("w42");
	});

	test("returns undefined when HERDR_WORKSPACE_ID is absent", () => {
		expect(getCallerWorkspaceId({})).toBeUndefined();
	});

	test("returns undefined when HERDR_WORKSPACE_ID is blank", () => {
		expect(getCallerWorkspaceId({ HERDR_WORKSPACE_ID: "   " })).toBeUndefined();
	});

	test("reads and trims HERDR_PANE_ID", () => {
		expect(getCallerPaneId({ HERDR_PANE_ID: "  w42:p3 " })).toBe("w42:p3");
		expect(getCallerPaneId({ HERDR_PANE_ID: " " })).toBeUndefined();
	});
});

describe("herdr Objective sidebar — resolveObjectiveSelector", () => {
	test("accepts slugs and active Objective paths", () => {
		const cwd = "/repo";

		expect(resolveObjectiveSelector("herdr-capability-parity", cwd)).toEqual({
			type: "valid",
			slug: "herdr-capability-parity",
		});
		expect(
			resolveObjectiveSelector(".ns/objectives/herdr-capability-parity/objective.md", cwd),
		).toEqual({
			type: "valid",
			slug: "herdr-capability-parity",
		});
		expect(resolveObjectiveSelector(".ns/objectives/herdr-capability-parity", cwd)).toEqual({
			type: "valid",
			slug: "herdr-capability-parity",
		});
		expect(
			resolveObjectiveSelector("/repo/.ns/objectives/herdr-capability-parity/roadmap.md", cwd),
		).toEqual({ type: "valid", slug: "herdr-capability-parity" });
	});

	test("rejects ambiguous or out-of-tree selectors", () => {
		const cwd = "/repo";
		for (const selector of [
			"foo/bar",
			".",
			"..",
			".ns/not-objectives/old/objective.md",
			"/tmp/outside/objective.md",
		]) {
			expect(resolveObjectiveSelector(selector, cwd).type).toBe("invalid");
		}
	});
});

describe("herdr Objective sidebar — formatObjectiveSidebarLabel", () => {
	test("keeps slot data out of the Objective workspace label", () => {
		const label = formatObjectiveSidebarLabel({
			objectiveSlug: "herdr-capability-parity",
		});
		expect(label).toBe("obj:herdr-capability-parity");
		// Slot is reported separately as the caller-pane title; branch is omitted.
		expect(label).not.toContain("::");
	});

	test("is deterministic for the same Objective slug", () => {
		const a = formatObjectiveSidebarLabel({ objectiveSlug: "test-objective" });
		const b = formatObjectiveSidebarLabel({ objectiveSlug: "test-objective" });
		expect(a).toBe(b);
	});
});
