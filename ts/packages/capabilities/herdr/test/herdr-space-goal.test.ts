import { afterEach, describe, expect, test, vi } from "vitest";

import { handleHerdrSpaceGoal } from "../src/core/space-goal.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import { registerHerdrSpaceGoalCommand } from "../src/pi/space-goal.ts";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	gitRootStep,
	notificationMessages,
	resetHerdrTestEnvironment,
	fakeNsExtensionApi,
	ROOT,
	step,
} from "./herdr-test-harness.ts";

const GOAL = "ship the auth refactor";

function modelStep(stdout: string, code = 0) {
	return step("pi", undefined, { code, stdout, stderr: code === 0 ? "" : "model failed" });
}

async function runGoal(options: {
	args?: string;
	cwd?: string;
	inputValues?: Array<string | undefined>;
	hasUI?: boolean;
	modelOutput?: string;
	modelCode?: number;
	herdr?: FakeHerdrGateway;
	hasSlots?: boolean;
}) {
	const cwd = options.cwd ?? ROOT;
	const pi = new FakePi({
		script: [
			gitRootStep(ROOT),
			modelStep(options.modelOutput ?? "refactor-auth", options.modelCode),
		],
		shouldRequireExpectedArgs: false,
	});
	const herdr = options.herdr ?? new FakeHerdrGateway();
	const ctx = new FakeCommandContext({
		cwd,
		...(options.inputValues === undefined ? {} : { inputValues: options.inputValues }),
		...(options.hasUI === undefined ? {} : { hasUI: options.hasUI }),
	});
	const progress: string[] = [];
	await handleHerdrSpaceGoal({
		pi: createHerdrPiCommandApi(pi),
		herdr,
		hasSlots: options.hasSlots ?? false,
		args: options.args ?? GOAL,
		ctx,
		notifyProgress: (message) => progress.push(message),
	});
	return { pi, herdr, ctx, progress };
}

afterEach(resetHerdrTestEnvironment);

describe("herdr space goal", () => {
	test("derives a bare slug and renames the caller workspace", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");

		const { pi, herdr, ctx, progress } = await runGoal({});

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "refactor-auth" }]);
		expect(progress).toEqual(["Interpreting goal…", "Renaming Herdr workspace…"]);
		expect(notificationMessages(ctx)).toContain("Applied Herdr space goal label: refactor-auth");
		expect(pi.execCalls[1]).toMatchObject({ command: "pi", options: { cwd: ROOT } });
		expect(pi.execCalls[1]?.args.at(-1)).toContain("Generate a concise workspace name slug");
	});

	test("prefixes the slug inside a managed slot", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const cwd = "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-3";

		const { pi, herdr } = await runGoal({ cwd, modelOutput: "add-auth", hasSlots: true });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "s3:add-auth" }]);
	});

	test("managed-slot path remains unprefixed when Slots is absent", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const cwd = "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-3";

		const { pi, herdr } = await runGoal({ cwd, modelOutput: "add-auth" });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "add-auth" }]);
	});

	test("ordinary cwd remains unprefixed when Slots is present", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");

		const { pi, herdr } = await runGoal({ hasSlots: true });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "refactor-auth" }]);
	});

	test("missing caller workspace stops before model work", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", undefined);
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext();

		await handleHerdrSpaceGoal({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			hasSlots: false,
			args: GOAL,
			ctx,
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "Not running inside a Herdr caller workspace.",
			level: "warning",
		});
	});

	test("prompts for an omitted goal", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");

		const { pi, herdr, ctx } = await runGoal({ args: "", inputValues: [GOAL] });

		pi.assertDone();
		expect(ctx.inputPrompts).toEqual([
			{ title: "Workspace goal", placeholder: "What is this space for?" },
		]);
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "refactor-auth" }]);
	});

	test("cancelled goal input reports usage without model work", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ inputValues: [undefined] });

		await handleHerdrSpaceGoal({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			hasSlots: false,
			args: "",
			ctx,
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "Usage: /ns:herdr:space:goal <goal>",
			level: "warning",
		});
	});

	test("falls back to the sanitized goal when model output is unusable", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");

		const { pi, herdr } = await runGoal({ modelOutput: "!!!" });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "ship-the-auth-refactor" }]);
	});

	test("model command failure reports an error without renaming", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");

		const { pi, herdr, ctx } = await runGoal({ modelCode: 1, modelOutput: "" });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Pi model command failed");
	});

	test("Pi wiring constructs one fresh API per successful invocation with exact cwd", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const firstCwd = "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-1";
		const secondCwd = "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-2";
		const pi = new FakePi({
			script: [
				gitRootStep(ROOT),
				modelStep("first-goal"),
				step("herdr", ["workspace", "rename", "w1", "s1:first-goal"]),
				gitRootStep(ROOT),
				modelStep("second-goal"),
				step("herdr", ["workspace", "rename", "w1", "s2:second-goal"]),
			],
			shouldRequireExpectedArgs: false,
		});
		const factoryCalls: string[] = [];
		registerHerdrSpaceGoalCommand(pi, async (cwd) => {
			factoryCalls.push(cwd);
			return fakeNsExtensionApi(cwd, true);
		});

		await pi.commands
			.get("ns:herdr:space:goal")
			?.handler(GOAL, new FakeCommandContext({ cwd: firstCwd }));
		await pi.commands
			.get("ns:herdr:space:goal")
			?.handler(GOAL, new FakeCommandContext({ cwd: secondCwd }));

		pi.assertDone();
		expect(factoryCalls).toEqual([firstCwd, secondCwd]);
	});

	test("Pi wiring resolves Slots presence before caller and input early returns", async () => {
		const cwd = "/repo";
		const pi = new FakePi();
		const factoryCalls: string[] = [];
		registerHerdrSpaceGoalCommand(pi, async (factoryCwd) => {
			factoryCalls.push(factoryCwd);
			return fakeNsExtensionApi(factoryCwd);
		});

		vi.stubEnv("HERDR_WORKSPACE_ID", undefined);
		await pi.commands.get("ns:herdr:space:goal")?.handler(GOAL, new FakeCommandContext({ cwd }));

		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		await pi.commands
			.get("ns:herdr:space:goal")
			?.handler("", new FakeCommandContext({ cwd, inputValues: [undefined] }));

		pi.assertDone();
		expect(factoryCalls).toEqual([cwd, cwd]);
	});

	test("Pi wiring propagates API construction failure before core work", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const cwd = "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-3";
		const pi = new FakePi({
			script: [
				gitRootStep(ROOT),
				modelStep("add-auth"),
				step("herdr", ["workspace", "rename", "w1", "add-auth"]),
			],
			shouldRequireExpectedArgs: false,
		});
		registerHerdrSpaceGoalCommand(pi, async () => {
			throw new Error("ns unavailable");
		});
		const ctx = new FakeCommandContext({ cwd });

		await expect(pi.commands.get("ns:herdr:space:goal")?.handler(GOAL, ctx)).rejects.toThrow(
			"ns unavailable",
		);

		expect(pi.execCalls).toEqual([]);
	});

	test("Pi wiring constructs the API before model work fails", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const pi = new FakePi({
			script: [gitRootStep(ROOT), modelStep("", 1)],
			shouldRequireExpectedArgs: false,
		});
		const factoryCalls: string[] = [];
		registerHerdrSpaceGoalCommand(pi, async (cwd) => {
			factoryCalls.push(cwd);
			return fakeNsExtensionApi(cwd, true);
		});

		await pi.commands
			.get("ns:herdr:space:goal")
			?.handler(GOAL, new FakeCommandContext({ cwd: "/repo" }));

		pi.assertDone();
		expect(factoryCalls).toEqual(["/repo"]);
	});

	test("unusable model output and goal report an error", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");

		const { pi, herdr, ctx } = await runGoal({ args: "!!!", modelOutput: "???" });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain(
			"could not be normalized into a workspace goal slug",
		);
	});

	test("rename failure is reported", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const herdr = new FakeHerdrGateway({
			renameResult: { type: "failed", message: "workspace not found" },
		});

		const { pi, ctx } = await runGoal({ herdr });

		pi.assertDone();
		expect(ctx.notifications.at(-1)).toEqual({
			message: "workspace not found",
			level: "error",
		});
	});
});
