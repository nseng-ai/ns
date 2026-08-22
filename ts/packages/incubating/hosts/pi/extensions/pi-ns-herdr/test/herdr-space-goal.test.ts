import { afterEach, describe, expect, test } from "vitest";

import { handleHerdrSpaceGoal } from "../src/core/space-goal.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import { registerHerdrSpaceGoalCommand } from "../src/pi/space-goal.ts";
import { resolveHerdrSlotLabelInput } from "../src/pi/resource-label.ts";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	failedCallerPane,
	gitRootStep,
	notificationMessages,
	resetHerdrTestEnvironment,
	resolvedCallerPane,
	ROOT,
	step,
} from "./herdr-test-harness.ts";

const GOAL = "ship the auth refactor";

function slugContext(commands: CommandExecApi) {
	return {
		commands,
		git: new RealGitGateway(commands),
		projectConfig: {
			readTextFile: () => ({
				type: "found" as const,
				text: '[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
			}),
			pathExists: () => ({ type: "missing" as const }),
		},
	};
}

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
	modelError?: Error;
	herdr?: FakeHerdrGateway;
}) {
	const cwd = options.cwd ?? ROOT;
	const pi = new FakePi({
		script: [
			gitRootStep(ROOT),
			options.modelError === undefined
				? modelStep(options.modelOutput ?? "refactor-auth", options.modelCode)
				: { command: "pi", ignoreArgs: true, error: options.modelError },
		],
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
	await handleHerdrSpaceGoal({
		contentSlug: slugContext(createHerdrPiCommandApi(pi)),
		herdr,
		resolveSlotLabelInput: async () =>
			cwd.includes("/worktrees/slot-03/") ? { slotSlug: "slot-03" } : {},
		args: options.args ?? GOAL,
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
		expect(pi.execCalls[1]).toMatchObject({ command: "pi", options: { cwd: ROOT } });
		expect(pi.execCalls[1]?.args.at(-1)).toContain(
			"Generate a concise semantic label for the Herdr space or tab",
		);
	});

	test("prefixes the slug from a managed Slot root resolved for a nested cwd", async () => {
		const cwd = "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-03/ts/packages";

		const { pi, herdr } = await runGoal({ cwd, modelOutput: "add-auth" });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "s3:add-auth" }]);
	});

	test("caller resolution failure stops before model work", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane() });
		const ctx = new FakeCommandContext();

		await handleHerdrSpaceGoal({
			contentSlug: slugContext(createHerdrPiCommandApi(pi)),
			herdr,
			resolveSlotLabelInput: async () => ({}),
			args: GOAL,
			ctx,
			notifyProgress: () => {},
		});

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
			contentSlug: slugContext(createHerdrPiCommandApi(pi)),
			herdr,
			resolveSlotLabelInput: async () => ({}),
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

	test("unusable model output fails closed without normalizing the original goal", async () => {
		const { pi, herdr, ctx } = await runGoal({
			args: "one two three four five six seven workspace",
			modelOutput: "!!!",
		});

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("No deterministic");
	});

	test("model command failure reports an error without falling back or renaming", async () => {
		const { pi, herdr, ctx } = await runGoal({ modelCode: 1, modelOutput: "" });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Pi model command failed");
		expect(ctx.notifications.at(-1)?.message).toContain("No deterministic");
	});

	test("thrown model execution does not fall back or rename", async () => {
		const { pi, herdr, ctx } = await runGoal({ modelError: new Error("spawn failed") });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("Pi model command failed");
		expect(ctx.notifications.at(-1)?.message).toContain("spawn failed");
		expect(ctx.notifications.at(-1)?.message).toContain("No deterministic");
	});

	test("empty model output does not fall back or rename", async () => {
		const { pi, herdr, ctx } = await runGoal({ modelOutput: "   \n" });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("returned empty output");
		expect(ctx.notifications.at(-1)?.message).toContain("No deterministic");
	});

	test("unusable model output and goal report an error", async () => {
		const { pi, herdr, ctx } = await runGoal({ args: "!!!", modelOutput: "???" });

		pi.assertDone();
		expect(herdr.renameCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain(
			"could not be normalized into a Herdr resource label",
		);
		expect(ctx.notifications.at(-1)?.message).toContain("No deterministic");
	});

	test("registered command uses the injected gateway and Git-resolved Slot root", async () => {
		const worktreeRoot = "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-03";
		const nestedCwd = `${worktreeRoot}/ts/packages/incubating`;
		const pi = new FakePi({
			script: [step("pi", undefined, { stdout: "add-auth" })],
			shouldRequireExpectedArgs: false,
		});
		const git = new InMemoryGitGateway({ optionalRepoRoot: worktreeRoot });
		const herdr = new FakeHerdrGateway({ callerPaneResult: resolvedCallerPane("w1") });
		registerHerdrSpaceGoalCommand({
			commands: createHerdrPiCommandApi(pi),
			git,
			projectConfig: {
				readTextFile: () => ({
					type: "found" as const,
					text: '[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
				}),
				pathExists: () => ({ type: "missing" as const }),
			},
			herdr,
			resolveSlotLabelInput: resolveHerdrSlotLabelInput.bind(undefined, git),
		});
		const ctx = new FakeCommandContext({ cwd: nestedCwd });

		await pi.commands.get("ns:herdr:space:goal")?.handler(GOAL, ctx);

		pi.assertDone();
		expect(git.optionalRepoRootCalls).toEqual([{ cwd: nestedCwd }, { cwd: nestedCwd }]);
		expect(herdr.renameCalls).toEqual([{ workspaceId: "w1", label: "s3:add-auth" }]);
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
