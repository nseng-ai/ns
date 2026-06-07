import { afterEach, describe, expect, test } from "bun:test";

import {
	formatObjectiveSidebarFields,
	resolveObjectiveSelector,
} from "../src/cmux/objective-sidebar.ts";
import { createCmuxSidebarController, registerCmuxSidebarCommands } from "../src/cmux/sidebar.ts";
import {
	FakeCommandContext,
	FakePi,
	cmuxSummaryStep,
	gitCurrentBranchStep,
	makeTempDir,
	notificationMessages,
	objectiveListStep,
	objectiveReadStep,
	objectiveSidebarDescription,
	resetCmuxTestEnvironment,
	step,
} from "./cmux-test-harness.ts";

afterEach(resetCmuxTestEnvironment);

describe("cmux Objective sidebar", () => {
	test("cmux:sidebar:objective-summary applies deterministic Objective sidebar from explicit slug", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const repoRoot = await makeTempDir();
		const slug = "cmux-extension-consolidation";
		const expectedTitle = `obj:${slug}`;
		const expectedDescription = objectiveSidebarDescription(repoRoot);
		const pi = new FakePi({
			script: [
				objectiveReadStep(slug),
				gitCurrentBranchStep(),
				cmuxSummaryStep(expectedTitle, expectedDescription),
			],
		});
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(1);
		expect(pi.execCalls).toEqual([
			{
				command: "objective",
				args: ["exec", "read-objective", slug, "--format", "json"],
				options: { cwd: repoRoot, timeout: 30_000 },
			},
			{
				command: "git",
				args: ["branch", "--show-current"],
				options: { cwd: repoRoot, timeout: 30_000 },
			},
			{
				command: "asdl",
				args: [
					"exec",
					"cmux-workspace-summary",
					"--title",
					expectedTitle,
					"--description",
					expectedDescription,
					"--format",
					"json",
				],
				options: { cwd: repoRoot, timeout: 30_000 },
			},
		]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
		expect(ctx.statuses).toEqual([
			{ key: "pi:cmux-sidebar", value: "preparing cmux Objective sidebar…" },
			{ key: "pi:cmux-sidebar", value: undefined },
		]);
		expect(notificationMessages(ctx)).toContain(`Applied cmux Objective sidebar: ${expectedTitle}`);
	});

	test("cmux:sidebar:objective-summary resolves Objective path selector to slug", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const repoRoot = await makeTempDir();
		const slug = "cmux-extension-consolidation";
		const expectedTitle = `obj:${slug}`;
		const expectedDescription = objectiveSidebarDescription(repoRoot);
		const pi = new FakePi({
			script: [objectiveReadStep(slug), gitCurrentBranchStep(), cmuxSummaryStep(expectedTitle, expectedDescription)],
		});
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler(`.asdl/objectives/${slug}/objective.md`, ctx);

		pi.assertDone();
		expect(pi.execCalls[0]).toMatchObject({ command: "objective", args: ["exec", "read-objective", slug, "--format", "json"] });
		expect(pi.sentUserMessages).toEqual([]);
	});

	test("cmux:sidebar:objective-summary without selector opens Objective picker and applies selection", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const repoRoot = await makeTempDir();
		const slug = "bravo-objective";
		const expectedTitle = `obj:${slug}`;
		const expectedDescription = objectiveSidebarDescription(repoRoot);
		const pi = new FakePi({
			script: [
				objectiveListStep(["alpha-objective", slug]),
				objectiveReadStep(slug),
				gitCurrentBranchStep(),
				cmuxSummaryStep(expectedTitle, expectedDescription),
			],
		});
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot, selectIndices: [1] });

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(1);
		expect(ctx.selections).toEqual([
			{
				title: "Select an active Objective for cmux sidebar",
				items: [
					"alpha-objective — open — latest update 2026-01-01T00:00:00Z",
					"bravo-objective — open — latest update 2026-01-02T00:00:00Z",
				],
			},
		]);
		expect(pi.execCalls.map((call) => [call.command, call.args])).toEqual([
			["objective", ["list", "--format", "json"]],
			["objective", ["exec", "read-objective", slug, "--format", "json"]],
			["git", ["branch", "--show-current"]],
			["asdl", ["exec", "cmux-workspace-summary", "--title", expectedTitle, "--description", expectedDescription, "--format", "json"]],
		]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
		expect(notificationMessages(ctx)).toContain(`Applied cmux Objective sidebar: ${expectedTitle}`);
	});

	test("cmux:sidebar:objective-summary picker cancellation stops without model or apply", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const pi = new FakePi({ script: [objectiveListStep(["alpha-objective"])] });
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cancelSelect: true });

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(pi.execCalls).toHaveLength(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({ message: "Objective selection cancelled.", level: "info" });
	});

	test("cmux:sidebar:objective-summary with no active Objectives stops without model or apply", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const pi = new FakePi({ script: [objectiveListStep([])] });
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(ctx.selections).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({ message: "No active Objectives. Create one with /skill:objective-create.", level: "info" });
	});

	test("cmux:sidebar:objective-summary missing workspace skips deterministic work", async () => {
		delete process.env.CMUX_WORKSPACE_ID;
		delete process.env.CMUX_TAB_ID;
		const pi = new FakePi();
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler("cmux-objective", ctx);

		expect(ctx.waitCount).toBe(1);
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe("Not running inside a cmux caller workspace.");
	});

	test("cmux:sidebar:objective-summary surfaces Objective read failure without applying cmux", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const slug = "ghost-objective";
		const pi = new FakePi({
			script: [
				step("objective", ["exec", "read-objective", slug, "--format", "json"], {
					code: 1,
					stdout: JSON.stringify({ exit_code: 1, message: "Objective not found", data: { status: "not_found" } }),
				}),
			],
		});
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(pi.execCalls).toHaveLength(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Objective not found");
	});

	test("cmux:sidebar:objective-summary rejects mismatched Objective read slug", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const slug = "requested-objective";
		const pi = new FakePi({
			script: [
				step("objective", ["exec", "read-objective", slug, "--format", "json"], {
					stdout: JSON.stringify({ exit_code: 0, data: { status: "ok", slug: "other-objective" } }),
				}),
			],
		});
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(pi.execCalls).toHaveLength(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("matching slug");
	});

	test("cmux:sidebar:objective-summary surfaces cmux apply failure", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const repoRoot = await makeTempDir();
		const slug = "cmux-extension-consolidation";
		const pi = new FakePi({
			script: [
				objectiveReadStep(slug),
				gitCurrentBranchStep(),
				step("asdl", [
					"exec",
					"cmux-workspace-summary",
					"--title",
					`obj:${slug}`,
					"--description",
					objectiveSidebarDescription(repoRoot),
					"--format",
					"json",
				], {
					code: 1,
					stdout: JSON.stringify({ exit_code: 1, message: "missing workspace", data: { success: false } }),
				}),
			],
		});
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(pi.execCalls).toHaveLength(3);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("missing workspace");
	});

});
describe("cmux Objective sidebar deterministic helpers", () => {
	test("resolveObjectiveSelector accepts slugs and active Objective paths", () => {
		const cwd = "/repo";

		expect(resolveObjectiveSelector("cmux-objective", cwd)).toEqual({ type: "valid", slug: "cmux-objective" });
		expect(resolveObjectiveSelector(".asdl/objectives/cmux-objective/objective.md", cwd)).toEqual({ type: "valid", slug: "cmux-objective" });
		expect(resolveObjectiveSelector(".asdl/objectives/cmux-objective", cwd)).toEqual({ type: "valid", slug: "cmux-objective" });
		expect(resolveObjectiveSelector("/repo/.asdl/objectives/cmux-objective/roadmap.md", cwd)).toEqual({ type: "valid", slug: "cmux-objective" });
	});

	test("resolveObjectiveSelector rejects ambiguous or inactive selectors", () => {
		const cwd = "/repo";
		for (const selector of ["foo/bar", ".", "..", ".asdl/objective-archive/old/objective.md", "/tmp/outside/objective.md"]) {
			expect(resolveObjectiveSelector(selector, cwd).type).toBe("invalid");
		}
	});

	test("formatObjectiveSidebarFields uses Objective, slot, and branch slugs deterministically", () => {
		const fields = formatObjectiveSidebarFields({
			objectiveSlug: "make-cmux-sidebar-descriptions-deterministic",
			slotSlug: "slot-05",
			branchSlug: "deterministic-objective-sidebar-direct-extension",
		});

		expect(fields).toEqual({
			title: "obj:make-cmux-sidebar-descriptions-deterministic",
			description: "slot-05::deterministic-objective-sidebar-direct-extension",
		});
		expect(formatObjectiveSidebarFields({
			objectiveSlug: "make-cmux-sidebar-descriptions-deterministic",
			slotSlug: "slot-05",
			branchSlug: "deterministic-objective-sidebar-direct-extension",
		})).toEqual(fields);
	});
});

