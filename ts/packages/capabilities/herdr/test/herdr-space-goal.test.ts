import { afterEach, describe, expect, test, vi } from "vitest";

import type { HasHerdrSlotsCapability } from "../src/core/slots-capability.ts";
import { handleHerdrSpaceGoal } from "../src/core/space-goal.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	gitRootStep,
	notificationMessages,
	resetHerdrTestEnvironment,
	step,
} from "./herdr-test-harness.ts";

const GOAL = "ship the auth refactor";

function modelStep(stdout: string, code = 0) {
	return step("pi", undefined, { code, stdout, stderr: code === 0 ? "" : "model failed" });
}

function slotsCapabilityFake(isAvailable: boolean): {
	calls: string[];
	predicate: HasHerdrSlotsCapability;
} {
	const calls: string[] = [];
	return {
		calls,
		predicate: async (cwd) => {
			calls.push(cwd);
			return isAvailable;
		},
	};
}

async function runGoal(options: {
	args?: string;
	cwd?: string;
	inputValues?: Array<string | undefined>;
	hasUI?: boolean;
	modelOutput?: string;
	modelCode?: number;
	hasSlotsCapability?: boolean;
	herdr?: FakeHerdrGateway;
}) {
	const cwd = options.cwd ?? "/repo";
	const pi = new FakePi({
		script: [
			gitRootStep(cwd),
			modelStep(options.modelOutput ?? "refactor-auth", options.modelCode),
		],
		shouldRequireExpectedArgs: false,
	});
	const capability = slotsCapabilityFake(options.hasSlotsCapability ?? false);
	const herdr = options.herdr ?? new FakeHerdrGateway();
	const ctx = new FakeCommandContext({
		cwd,
		...(options.inputValues === undefined ? {} : { inputValues: options.inputValues }),
		...(options.hasUI === undefined ? {} : { hasUI: options.hasUI }),
	});
	const progress: string[] = [];
	await handleHerdrSpaceGoal({
		context: {
			pi: createHerdrPiCommandApi(pi),
			herdr,
			hasSlotsCapability: capability.predicate,
		},
		args: options.args ?? GOAL,
		ctx,
		notifyProgress: (message) => progress.push(message),
	});
	return { pi, herdr, ctx, progress, capabilityCalls: capability.calls };
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
		expect(pi.execCalls[1]).toMatchObject({ command: "pi", options: { cwd: "/repo" } });
		expect(pi.execCalls[1]?.args.at(-1)).toContain("Generate a concise workspace name slug");
	});

	test("prefixes the slug inside a managed slot when Slots capability is available", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const cwd = "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-3";

		const { pi, herdr, capabilityCalls } = await runGoal({
			cwd,
			modelOutput: "add-auth",
			hasSlotsCapability: true,
		});

		pi.assertDone();
		expect(capabilityCalls).toEqual([cwd]);
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "s3:add-auth" }]);
	});

	test("omits the slot prefix when Slots capability is unavailable", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
		const cwd = "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-3";

		const { pi, herdr, capabilityCalls } = await runGoal({ cwd, modelOutput: "add-auth" });

		pi.assertDone();
		expect(capabilityCalls).toEqual([cwd]);
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "add-auth" }]);
	});

	test("ordinary cwd stays unprefixed even when Slots capability is available", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");

		const { pi, herdr } = await runGoal({ hasSlotsCapability: true });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "refactor-auth" }]);
	});

	test("missing caller workspace stops before model work", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", undefined);
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const capability = slotsCapabilityFake(true);
		const ctx = new FakeCommandContext();

		await handleHerdrSpaceGoal({
			context: {
				pi: createHerdrPiCommandApi(pi),
				herdr,
				hasSlotsCapability: capability.predicate,
			},
			args: GOAL,
			ctx,
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(capability.calls).toEqual([]);
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
		const capability = slotsCapabilityFake(true);
		const ctx = new FakeCommandContext({ inputValues: [undefined] });

		await handleHerdrSpaceGoal({
			context: {
				pi: createHerdrPiCommandApi(pi),
				herdr,
				hasSlotsCapability: capability.predicate,
			},
			args: "",
			ctx,
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(capability.calls).toEqual([]);
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

		const cwd = "/repo";
		const pi = new FakePi({
			script: [gitRootStep(cwd), modelStep("", 1)],
			shouldRequireExpectedArgs: false,
		});
		const herdr = new FakeHerdrGateway();
		const capability = slotsCapabilityFake(true);
		const ctx = new FakeCommandContext({ cwd });

		await handleHerdrSpaceGoal({
			context: {
				pi: createHerdrPiCommandApi(pi),
				herdr,
				hasSlotsCapability: capability.predicate,
			},
			args: GOAL,
			ctx,
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(capability.calls).toEqual([]);
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Pi model command failed");
	});

	test("unusable model output and goal report an error", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "w1");

		const cwd = "/repo";
		const pi = new FakePi({
			script: [gitRootStep(cwd), modelStep("???")],
			shouldRequireExpectedArgs: false,
		});
		const herdr = new FakeHerdrGateway();
		const capability = slotsCapabilityFake(true);
		const ctx = new FakeCommandContext({ cwd });

		await handleHerdrSpaceGoal({
			context: {
				pi: createHerdrPiCommandApi(pi),
				herdr,
				hasSlotsCapability: capability.predicate,
			},
			args: "!!!",
			ctx,
			notifyProgress: () => {},
		});

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
