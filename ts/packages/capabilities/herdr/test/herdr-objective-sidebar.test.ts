import { afterEach, describe, expect, test, vi } from "vitest";

import {
	createHerdrSidebarControllerWithPiWiring,
	registerHerdrSidebarCommands,
} from "@nseng-ai/herdr/pi";
import { createHerdrSidebarController, getCallerWorkspaceId } from "../src/core/sidebar.ts";
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

afterEach(resetHerdrTestEnvironment);

describe("herdr Objective sidebar", () => {
	test("ns:herdr:space:objective-summary applies label from explicit slug", async () => {
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

		await pi.commands.get("ns:herdr:space:objective-summary")?.handler(slug, ctx);

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
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.statuses).toEqual([
			{ key: "pi:herdr-sidebar", value: "preparing Herdr Objective sidebar…" },
			{ key: "pi:herdr-sidebar", value: undefined },
		]);
		expect(notificationMessages(ctx)).toContain(
			`Applied Herdr Objective sidebar: ${expectedLabel}`,
		);
	});

	test("ns:herdr:space:objective-summary prefixes labels inside a managed slot", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const slug = "areg-lifecycle-ergonomics";
		const pi = new FakePi({ script: [objectiveReadStep(slug)] });
		const herdr = new FakeHerdrGateway();
		const controller = createHerdrSidebarController(createHerdrPiCommandApi(pi), herdr);
		registerHerdrSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({
			cwd: "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-01",
		});

		await pi.commands.get("ns:herdr:space:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([
			{ workspaceId: "w1", label: "s1:obj:areg-lifecycle-ergonomics" },
		]);
	});

	test("ns:herdr:space:objective-summary resolves path selector to slug", async () => {
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
			.get("ns:herdr:space:objective-summary")
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

	test("ns:herdr:space:objective-summary without selector opens Objective picker", async () => {
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

		await pi.commands.get("ns:herdr:space:objective-summary")?.handler("", ctx);

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
		expect(notificationMessages(ctx)).toContain(
			`Applied Herdr Objective sidebar: ${expectedLabel}`,
		);
	});

	test("ns:herdr:space:objective-summary suggests the only changed active Objective", async () => {
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

		await pi.commands.get("ns:herdr:space:objective-summary")?.handler("", ctx);

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
		expect(notificationMessages(ctx)).toContain(`Applied Herdr Objective sidebar: obj:${slug}`);
	});

	test("ns:herdr:space:objective-summary picker cancellation stops without rename", async () => {
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

		await pi.commands.get("ns:herdr:space:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "Objective selection cancelled.",
			level: "info",
		});
	});

	test("ns:herdr:space:objective-summary with no active Objectives stops without rename", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const pi = new FakePi({ script: [objectiveListStep([])] });
		const adaptedPi = createHerdrPiCommandApi(pi);
		const herdr = new FakeHerdrGateway();
		const controller = createHerdrSidebarController(adaptedPi, herdr);
		registerHerdrSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("ns:herdr:space:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.selections).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "No active Objectives. Create one with /ns:objective:create.",
			level: "info",
		});
	});

	test("ns:herdr:space:objective-summary missing workspace skips all work", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", undefined);
		const pi = new FakePi();
		const adaptedPi = createHerdrPiCommandApi(pi);
		const herdr = new FakeHerdrGateway();
		const controller = createHerdrSidebarController(adaptedPi, herdr);
		registerHerdrSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands
			.get("ns:herdr:space:objective-summary")
			?.handler("herdr-capability-parity", ctx);

		expect(ctx.waitCount).toBe(1);
		expect(pi.execCalls).toEqual([]);
		expect(herdr.renameCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe("Not running inside a Herdr caller workspace.");
	});

	test("ns:herdr:space:objective-summary surfaces Objective read failure without rename", async () => {
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

		await pi.commands.get("ns:herdr:space:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Objective not found");
	});

	test("ns:herdr:space:objective-summary surfaces herdr rename failure", async () => {
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

		await pi.commands.get("ns:herdr:space:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(herdr.renameCalls).toHaveLength(1);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("workspace not found");
	});

	test("ns:herdr:space:objective-summary label-only: does not read slot or branch", async () => {
		// Verifies the label-only behavior: only objective validation and
		// `herdr workspace rename` are performed — no branch or slot reads.
		// The label encodes only the Objective slug.
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

		await pi.commands.get("ns:herdr:space:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		// Only objective exec call — no git branch call
		expect(pi.execCalls).toHaveLength(1);
		expect(pi.execCalls[0]?.command).toBe("ns");
		// Label contains only the Objective slug — no slot or branch suffix
		expect(herdr.renameCalls).toEqual([
			{ workspaceId: "workspace-42", label: "obj:herdr-capability-parity" },
		]);
	});

	test("ns:herdr:space:objective-summary uses Pi wiring end-to-end", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const pi = new FakePi();
		const controller = createHerdrSidebarControllerWithPiWiring(pi);
		registerHerdrSidebarCommands(pi, controller);
		expect(pi.commands.has("ns:herdr:space:objective-summary")).toBe(true);
	});
});

describe("herdr Objective sidebar — getCallerWorkspaceId", () => {
	test("reads HERDR_WORKSPACE_ID from injected env", () => {
		expect(getCallerWorkspaceId({ HERDR_WORKSPACE_ID: "w42" })).toBe("w42");
	});

	test("returns undefined when HERDR_WORKSPACE_ID is absent", () => {
		expect(getCallerWorkspaceId({})).toBeUndefined();
	});

	test("returns undefined when HERDR_WORKSPACE_ID is blank", () => {
		expect(getCallerWorkspaceId({ HERDR_WORKSPACE_ID: "   " })).toBeUndefined();
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
	test("prefixes the Objective with a compact numbered slot", () => {
		expect(
			formatObjectiveSidebarLabel({
				objectiveSlug: "areg-lifecycle-ergonomics",
				slotSlug: "slot-01",
			}),
		).toBe("s1:obj:areg-lifecycle-ergonomics");
	});

	test("omits the slot prefix when slots are not in use", () => {
		expect(formatObjectiveSidebarLabel({ objectiveSlug: "test-objective" })).toBe(
			"obj:test-objective",
		);
	});

	test("is deterministic for the same Objective and slot", () => {
		const input = { objectiveSlug: "test-objective", slotSlug: "slot-12" };
		expect(formatObjectiveSidebarLabel(input)).toBe(formatObjectiveSidebarLabel(input));
	});
});
