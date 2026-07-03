import { afterEach, describe, expect, test } from "vitest";

import { createCccSidebarControllerWithPiWiring, registerCccSidebarCommands } from "@sdl/ccc/pi";
import {
	formatObjectiveSidebarFields,
	resolveObjectiveSelector,
} from "../src/cmux/objective-sidebar.ts";
import {
	FakeCommandContext,
	FakePi,
	cmuxSummaryStep,
	gitCurrentBranchStep,
	makeTempDir,
	notificationMessages,
	objectiveDiffStep,
	objectiveListStep,
	objectiveReadStep,
	objectiveSidebarDescription,
	objectiveStatusStep,
	resetCmuxTestEnvironment,
	step,
} from "./ccc-test-harness.ts";

afterEach(resetCmuxTestEnvironment);

describe("cmux Objective sidebar", () => {
	test("ccc:sidebar:objective-summary applies deterministic Objective sidebar from explicit slug", async () => {
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
		const controller = createCccSidebarControllerWithPiWiring(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands.get("ccc:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(1);
		expect(pi.execCalls).toEqual([
			{
				command: "ji",
				args: ["objective", "exec", "read-objective", slug, "--format", "json"],
				options: { cwd: repoRoot, timeout: 30_000 },
			},
			{
				command: "git",
				args: ["branch", "--show-current"],
				options: { cwd: repoRoot, timeout: 30_000 },
			},
			{
				command: "ccc",
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
			{ key: "pi:ccc-sidebar", value: "preparing cmux Objective sidebar…" },
			{ key: "pi:ccc-sidebar", value: undefined },
		]);
		expect(notificationMessages(ctx)).toContain(`Applied cmux Objective sidebar: ${expectedTitle}`);
	});

	test("ccc:sidebar:objective-summary resolves Objective path selector to slug", async () => {
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
		const controller = createCccSidebarControllerWithPiWiring(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands
			.get("ccc:sidebar:objective-summary")
			?.handler(`.ji/objectives/${slug}/objective.md`, ctx);

		pi.assertDone();
		expect(pi.execCalls[0]).toMatchObject({
			command: "ji",
			args: ["objective", "exec", "read-objective", slug, "--format", "json"],
		});
		expect(pi.sentUserMessages).toEqual([]);
	});

	test("ccc:sidebar:objective-summary without selector opens Objective picker and applies selection", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const repoRoot = await makeTempDir();
		const slug = "bravo-objective";
		const expectedTitle = `obj:${slug}`;
		const expectedDescription = objectiveSidebarDescription(repoRoot);
		const pi = new FakePi({
			script: [
				objectiveListStep(["alpha-objective", slug]),
				objectiveDiffStep(""),
				objectiveStatusStep(""),
				objectiveReadStep(slug),
				gitCurrentBranchStep(),
				cmuxSummaryStep(expectedTitle, expectedDescription),
			],
		});
		const controller = createCccSidebarControllerWithPiWiring(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot, selectIndices: [1] });

		await pi.commands.get("ccc:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(2);
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
			["git", ["diff", "--name-status", "-M", "master...HEAD", "--", ".ji/objectives"]],
			["git", ["status", "--porcelain=v1", "-z", "--", ".ji/objectives"]],
			["ji", ["objective", "exec", "read-objective", slug, "--format", "json"]],
			["git", ["branch", "--show-current"]],
			[
				"ccc",
				[
					"exec",
					"cmux-workspace-summary",
					"--title",
					expectedTitle,
					"--description",
					expectedDescription,
					"--format",
					"json",
				],
			],
		]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
		expect(notificationMessages(ctx)).toContain(`Applied cmux Objective sidebar: ${expectedTitle}`);
	});

	test("ccc:sidebar:objective-summary suggests the only changed active Objective", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const repoRoot = await makeTempDir();
		const slug = "bravo-objective";
		const expectedTitle = `obj:${slug}`;
		const expectedDescription = objectiveSidebarDescription(repoRoot);
		const pi = new FakePi({
			script: [
				objectiveListStep(["alpha-objective", slug, "charlie-objective"]),
				objectiveDiffStep(`M\t.ji/objectives/${slug}/objective.md\n`),
				objectiveStatusStep(""),
				objectiveReadStep(slug),
				gitCurrentBranchStep(),
				cmuxSummaryStep(expectedTitle, expectedDescription),
			],
		});
		const controller = createCccSidebarControllerWithPiWiring(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands.get("ccc:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(ctx.selections).toEqual([
			{
				title: "Select an active Objective for cmux sidebar (only Objective changed vs master)",
				items: [
					"bravo-objective — suggested: only Objective changed vs master — open — latest update 2026-01-02T00:00:00Z",
					"View other active Objectives…",
				],
			},
		]);
		expect(pi.execCalls.at(-1)).toMatchObject({
			command: "ccc",
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
		});
		expect(pi.sentUserMessages).toEqual([]);
		expect(notificationMessages(ctx)).toContain(`Applied cmux Objective sidebar: ${expectedTitle}`);
	});

	test("ccc:sidebar:objective-summary can escape from changed suggestion to other active Objectives", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const repoRoot = await makeTempDir();
		const slug = "charlie-objective";
		const expectedTitle = `obj:${slug}`;
		const expectedDescription = objectiveSidebarDescription(repoRoot);
		const pi = new FakePi({
			script: [
				objectiveListStep(["alpha-objective", "bravo-objective", slug]),
				objectiveDiffStep("M\t.ji/objectives/bravo-objective/objective.md\n"),
				objectiveStatusStep(""),
				objectiveReadStep(slug),
				gitCurrentBranchStep(),
				cmuxSummaryStep(expectedTitle, expectedDescription),
			],
		});
		const controller = createCccSidebarControllerWithPiWiring(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot, selectIndices: [1, 1] });

		await pi.commands.get("ccc:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(ctx.selections[0]).toEqual({
			title: "Select an active Objective for cmux sidebar (only Objective changed vs master)",
			items: [
				"bravo-objective — suggested: only Objective changed vs master — open — latest update 2026-01-02T00:00:00Z",
				"View other active Objectives…",
			],
		});
		expect(ctx.selections[1]).toEqual({
			title: "Select an active Objective for cmux sidebar (other active Objectives)",
			items: [
				"alpha-objective — open — latest update 2026-01-01T00:00:00Z",
				"charlie-objective — open — latest update 2026-01-03T00:00:00Z",
			],
		});
		expect(pi.execCalls.at(-1)).toMatchObject({ command: "ccc" });
		expect(notificationMessages(ctx)).toContain(`Applied cmux Objective sidebar: ${expectedTitle}`);
	});

	test("ccc:sidebar:objective-summary picker cancellation stops without model or apply", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const pi = new FakePi({
			script: [
				objectiveListStep(["alpha-objective"]),
				objectiveDiffStep(""),
				objectiveStatusStep(""),
			],
		});
		const controller = createCccSidebarControllerWithPiWiring(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ shouldCancelSelect: true });

		await pi.commands.get("ccc:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(pi.execCalls).toHaveLength(2);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "Objective selection cancelled.",
			level: "info",
		});
	});

	test("ccc:sidebar:objective-summary with no active Objectives stops without model or apply", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const pi = new FakePi({ script: [objectiveListStep([])] });
		const controller = createCccSidebarControllerWithPiWiring(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("ccc:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(ctx.selections).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "No active Objectives. Create one with /objective:create.",
			level: "info",
		});
	});

	test("ccc:sidebar:objective-summary missing workspace skips deterministic work", async () => {
		delete process.env.CMUX_WORKSPACE_ID;
		delete process.env.CMUX_TAB_ID;
		const pi = new FakePi();
		const controller = createCccSidebarControllerWithPiWiring(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("ccc:sidebar:objective-summary")?.handler("cmux-objective", ctx);

		expect(ctx.waitCount).toBe(1);
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe("Not running inside a cmux caller workspace.");
	});

	test("ccc:sidebar:objective-summary surfaces Objective read failure without applying cmux", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const slug = "ghost-objective";
		const pi = new FakePi({
			script: [
				step("ji", ["objective", "exec", "read-objective", slug, "--format", "json"], {
					code: 1,
					stdout: JSON.stringify({
						exitCode: 1,
						message: "Objective not found",
						data: { status: "not_found" },
					}),
				}),
			],
		});
		const controller = createCccSidebarControllerWithPiWiring(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("ccc:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(pi.execCalls).toHaveLength(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Objective not found");
	});

	test("ccc:sidebar:objective-summary rejects mismatched Objective read slug", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const slug = "requested-objective";
		const pi = new FakePi({
			script: [
				step("ji", ["objective", "exec", "read-objective", slug, "--format", "json"], {
					stdout: JSON.stringify({ exitCode: 0, data: { status: "ok", slug: "other-objective" } }),
				}),
			],
		});
		const controller = createCccSidebarControllerWithPiWiring(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("ccc:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(pi.execCalls).toHaveLength(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("matching slug");
	});

	test("ccc:sidebar:objective-summary surfaces cmux apply failure", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const repoRoot = await makeTempDir();
		const slug = "cmux-extension-consolidation";
		const pi = new FakePi({
			script: [
				objectiveReadStep(slug),
				gitCurrentBranchStep(),
				step(
					"ccc",
					[
						"exec",
						"cmux-workspace-summary",
						"--title",
						`obj:${slug}`,
						"--description",
						objectiveSidebarDescription(repoRoot),
						"--format",
						"json",
					],
					{
						code: 1,
						stdout: JSON.stringify({
							exitCode: 1,
							message: "missing workspace",
							data: { success: false },
						}),
					},
				),
			],
		});
		const controller = createCccSidebarControllerWithPiWiring(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands.get("ccc:sidebar:objective-summary")?.handler(slug, ctx);

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

		expect(resolveObjectiveSelector("cmux-objective", cwd)).toEqual({
			type: "valid",
			slug: "cmux-objective",
		});
		expect(resolveObjectiveSelector(".ji/objectives/cmux-objective/objective.md", cwd)).toEqual({
			type: "valid",
			slug: "cmux-objective",
		});
		expect(resolveObjectiveSelector(".ji/objectives/cmux-objective", cwd)).toEqual({
			type: "valid",
			slug: "cmux-objective",
		});
		expect(resolveObjectiveSelector("/repo/.ji/objectives/cmux-objective/roadmap.md", cwd)).toEqual(
			{ type: "valid", slug: "cmux-objective" },
		);
	});

	test("resolveObjectiveSelector rejects ambiguous or inactive selectors", () => {
		const cwd = "/repo";
		for (const selector of [
			"foo/bar",
			".",
			"..",
			".ji/objective-archive/old/objective.md",
			"/tmp/outside/objective.md",
		]) {
			expect(resolveObjectiveSelector(selector, cwd).type).toBe("invalid");
		}
	});

	test("formatObjectiveSidebarFields uses Objective, slot, and branch slugs deterministically", () => {
		const fields = formatObjectiveSidebarFields({
			objectiveSlug: "make-ccc-sidebar-descriptions-deterministic",
			slotSlug: "slot-05",
			branchSlug: "deterministic-objective-sidebar-direct-extension",
		});

		expect(fields).toEqual({
			title: "obj:make-ccc-sidebar-descriptions-deterministic",
			description: "slot-05::deterministic-objective-sidebar-direct-extension",
		});
		expect(
			formatObjectiveSidebarFields({
				objectiveSlug: "make-ccc-sidebar-descriptions-deterministic",
				slotSlug: "slot-05",
				branchSlug: "deterministic-objective-sidebar-direct-extension",
			}),
		).toEqual(fields);
	});
});
