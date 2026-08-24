import { afterEach, describe, expect, test } from "vitest";

import { generateWorkspaceGoalSlug, handleHerdrSpaceGoal } from "../src/core/space-goal.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import { registerHerdrSpaceGoalCommand } from "../src/pi/space-goal.ts";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	failedCallerPane,
	notificationMessages,
	resetHerdrTestEnvironment,
	resolvedCallerPane,
	herdrTestProjectConfigFactory,
	ROOT,
	step,
} from "./herdr-test-harness.ts";

const GOAL = "ship the auth refactor";
const MODEL_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};

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
}) {
	const cwd = options.cwd ?? ROOT;
	const pi = new FakePi({
		script: [modelStep(options.modelOutput ?? "refactor-auth", options.modelCode)],
		shouldRequireExpectedArgs: false,
	});
	const herdr =
		options.herdr ?? new FakeHerdrGateway({ callerPaneResult: resolvedCallerPane("w1") });
	const ctx = new FakeCommandContext({
		cwd,
		...(options.inputValues === undefined ? {} : { inputValues: options.inputValues }),
		...(options.hasUI === undefined ? {} : { hasUI: options.hasUI }),
	});
	const progress: string[] = [];
	const goal = options.args ?? GOAL;
	await handleHerdrSpaceGoal({
		herdr,
		workspaceId: "w1",
		labelDeriver: {
			deriveSlug: ({ cwd: inputCwd, goal: inputGoal }) =>
				generateWorkspaceGoalSlug(
					createHerdrPiCommandApi(pi),
					inputCwd,
					inputGoal,
					MODEL_SELECTION,
				),
		},
		args: goal,
		ctx,
		notifyProgress: (message) => progress.push(message),
	});
	return { pi, herdr, ctx, progress };
}

afterEach(resetHerdrTestEnvironment);

describe("herdr space goal", () => {
	test("derives a bare slug and renames the caller workspace", async () => {
		const { pi, herdr, ctx, progress } = await runGoal({});

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "refactor-auth" }]);
		expect(progress).toEqual(["Interpreting goal…", "Renaming Herdr workspace…"]);
		expect(notificationMessages(ctx)).toContain("Applied Herdr space goal label: refactor-auth");
		expect(pi.execCalls[0]).toMatchObject({ command: "pi", options: { cwd: ROOT } });
		expect(pi.execCalls[0]?.args.at(-1)).toContain("Generate a concise workspace name slug");
	});

	test("prefixes the slug inside a managed slot", async () => {
		const cwd = "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-3";

		const { pi, herdr } = await runGoal({ cwd, modelOutput: "add-auth" });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "s3:add-auth" }]);
	});

	test("caller resolution failure stops before model work", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane() });
		const ctx = new FakeCommandContext();

		registerHerdrSpaceGoalCommand({
			commands: createHerdrPiCommandApi(pi),
			git: new InMemoryGitGateway(),
			herdr,
			createProjectConfig: herdrTestProjectConfigFactory(pi),
		});
		await pi.commands.get("ns:herdr:space:goal")?.handler(GOAL, ctx);

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: `Not running inside a Herdr caller space.\nCould not resolve the Herdr caller pane.`,
			level: "warning",
		});
	});

	test("prompts for an omitted goal", async () => {
		const { pi, herdr, ctx } = await runGoal({ args: "", inputValues: [GOAL] });

		pi.assertDone();
		expect(ctx.inputPrompts).toEqual([
			{ title: "Workspace goal", placeholder: "What is this space for?" },
		]);
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "refactor-auth" }]);
	});

	test("cancelled goal input reports usage without model work", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway({ callerPaneResult: resolvedCallerPane("w1") });
		const ctx = new FakeCommandContext({ inputValues: [undefined] });

		await handleHerdrSpaceGoal({
			herdr,
			workspaceId: "w1",
			labelDeriver: {
				deriveSlug: () => Promise.reject(new Error("unexpected model work")),
			},
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
		const { pi, herdr } = await runGoal({ modelOutput: "!!!" });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "ship-the-auth-refactor" }]);
	});

	test("model command failure reports an error without renaming", async () => {
		const { pi, herdr, ctx } = await runGoal({ modelCode: 1, modelOutput: "" });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Pi model command failed");
	});

	test("unusable model output and goal report an error", async () => {
		const { pi, herdr, ctx } = await runGoal({ args: "!!!", modelOutput: "???" });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain(
			"could not be normalized into a workspace goal slug",
		);
	});

	test("rename failure is reported", async () => {
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
