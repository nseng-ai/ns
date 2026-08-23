import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { handleHerdrNewTab, handleHerdrTabGoal } from "../src/core/tab.ts";
import { generateWorkspaceGoalSlug } from "../src/core/space-goal.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import { registerHerdrNewTabCommand, registerHerdrTabGoalCommand } from "../src/pi/tab.ts";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	failedCallerPane,
	herdrTestProjectConfigFactory,
	missingHerdrTestProjectConfigFactory,
	notificationMessages,
	resolvedCallerPane,
	ROOT,
	step,
} from "./herdr-test-harness.ts";

const MODEL_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};

function goalLabelDeriver(pi: FakePi) {
	return {
		deriveSlug: ({ cwd, goal }: { cwd: string; goal: string }) =>
			generateWorkspaceGoalSlug(createHerdrPiCommandApi(pi), cwd, goal, MODEL_SELECTION),
	};
}

describe("Herdr tab resources", () => {
	test("tab:new creates an unprefixed focused tab in the captured caller workspace", async () => {
		const herdr = new FakeHerdrGateway({ callerPaneResult: resolvedCallerPane("w-1") });
		const ctx = new FakeCommandContext({
			cwd: "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-03",
		});
		await handleHerdrNewTab({
			herdr,
			workspaceId: "w-1",
			labelDeriver: { deriveLabel: async () => "review-api" },
			args: "review the API",
			ctx,
			notifyProgress: () => {},
		});
		expect(herdr.resolveCallerPaneCalls).toBe(0);
		expect(herdr.createTabCalls).toEqual([
			{
				options: {
					workspaceId: "w-1",
					cwd: "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-03",
					shouldFocus: true,
					label: "review-api",
				},
			},
		]);
	});

	test("tab:new without a description creates an unlabeled focused tab", async () => {
		const herdr = new FakeHerdrGateway({ callerPaneResult: resolvedCallerPane("w-1") });
		const ctx = new FakeCommandContext({ cwd: "/repo/package" });
		await handleHerdrNewTab({
			herdr,
			workspaceId: "w-1",
			args: "  ",
			ctx,
			notifyProgress: () => {},
		});
		expect(herdr.createTabCalls).toEqual([
			{ options: { workspaceId: "w-1", cwd: "/repo/package", shouldFocus: true } },
		]);
	});

	test("tab:new model failure happens before tab mutation", async () => {
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext();
		await handleHerdrNewTab({
			herdr,
			workspaceId: "caller-workspace",
			labelDeriver: {
				deriveLabel: async () => Promise.reject(new Error("model unavailable")),
			},
			args: "description",
			ctx,
			notifyProgress: () => {},
		});
		expect(herdr.createTabCalls).toEqual([]);
		expect(notificationMessages(ctx).join("\n")).toContain("model unavailable");
		expect(notificationMessages(ctx).join("\n")).toContain("No tab was created.");
	});

	test("tab:new reports create gateway failure", async () => {
		const herdr = new FakeHerdrGateway({
			createTabResult: { type: "failed", message: "workspace disappeared" },
		});
		const ctx = new FakeCommandContext();
		await handleHerdrNewTab({
			herdr,
			workspaceId: "caller-workspace",
			args: "",
			ctx,
			notifyProgress: () => {},
		});
		expect(notificationMessages(ctx)).toContain("workspace disappeared");
	});

	test("registered tab:new captures the caller workspace before idle wait", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway({ callerPaneResult: resolvedCallerPane("captured-ws") });
		const git = new InMemoryGitGateway();
		const ctx = new FakeCommandContext({
			onWaitForIdle: () => expect(herdr.resolveCallerPaneCalls).toBe(1),
		});
		registerHerdrNewTabCommand({
			commands: createHerdrPiCommandApi(pi),
			git,
			herdr,
			createProjectConfig: herdrTestProjectConfigFactory(pi),
		});

		await pi.commands.get("ns:herdr:tab:new")?.handler("", ctx);

		pi.assertDone();
		expect(git.optionalRepoRootCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([
			{ options: { workspaceId: "captured-ws", cwd: ROOT, shouldFocus: true } },
		]);
	});

	test("registered tab:new caller failure wins before idle wait and model config resolution", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane("no caller pane") });
		const git = new InMemoryGitGateway({ optionalRepoRoot: ROOT });
		const ctx = new FakeCommandContext();
		registerHerdrNewTabCommand({
			commands: createHerdrPiCommandApi(pi),
			git,
			herdr,
			createProjectConfig: herdrTestProjectConfigFactory(pi),
		});

		await pi.commands.get("ns:herdr:tab:new")?.handler("description", ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(0);
		expect(git.optionalRepoRootCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([]);
		expect(ctx.notifications).toContainEqual({
			message: "Not running inside a Herdr caller space.\nno caller pane",
			level: "warning",
		});
	});

	test("registered tab:new config failure stops before Herdr mutation", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway({ callerPaneResult: resolvedCallerPane("w-1") });
		const git = new InMemoryGitGateway({ optionalRepoRoot: { type: "missing" } });
		const ctx = new FakeCommandContext();
		registerHerdrNewTabCommand({
			commands: createHerdrPiCommandApi(pi),
			git,
			herdr,
			createProjectConfig: missingHerdrTestProjectConfigFactory(),
		});

		await pi.commands.get("ns:herdr:tab:new")?.handler("description", ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(1);
		expect(git.optionalRepoRootCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([]);
		expect(notificationMessages(ctx).join("\n")).toContain("No tab was created");
	});

	test("tab:goal uses an unprefixed goal slug and renames only caller tab", async () => {
		const pi = new FakePi({
			script: [step("pi", undefined, { stdout: "add-auth" })],
			shouldRequireExpectedArgs: false,
		});
		const herdr = new FakeHerdrGateway({
			callerPaneResult: resolvedCallerPane("caller-workspace", "t-9"),
		});
		const ctx = new FakeCommandContext({
			cwd: "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-03",
		});
		await handleHerdrTabGoal({
			herdr,
			tabId: "caller-tab",
			labelDeriver: goalLabelDeriver(pi),
			args: "ship auth",
			ctx,
			notifyProgress: () => {},
		});
		expect(herdr.renameTabCalls).toEqual([{ tabId: "caller-tab", label: "add-auth" }]);
		expect(herdr.renameCalls).toEqual([]);
		expect(notificationMessages(ctx)).toContain("Applied Herdr tab goal label: add-auth");
		pi.assertDone();
	});

	test("tab:goal uses interactive fallback and cancel does not mutate", async () => {
		const pi = new FakePi({
			script: [step("pi", undefined, { stdout: "interactive-goal" })],
			shouldRequireExpectedArgs: false,
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ inputValues: ["  ship interactively  "] });
		await handleHerdrTabGoal({
			herdr,
			tabId: "caller-tab",
			labelDeriver: goalLabelDeriver(pi),
			args: "",
			ctx,
			notifyProgress: () => {},
		});
		expect(herdr.renameTabCalls).toEqual([{ tabId: "caller-tab", label: "interactive-goal" }]);
		pi.assertDone();

		const cancelledPi = new FakePi();
		const cancelledHerdr = new FakeHerdrGateway();
		const cancelledCtx = new FakeCommandContext({ inputValues: [undefined] });
		await handleHerdrTabGoal({
			herdr: cancelledHerdr,
			tabId: "caller-tab",
			labelDeriver: goalLabelDeriver(cancelledPi),
			args: "",
			ctx: cancelledCtx,
			notifyProgress: () => {},
		});
		expect(cancelledHerdr.renameTabCalls).toEqual([]);
		cancelledPi.assertDone();
	});

	test("tab:goal model failure happens before rename", async () => {
		const pi = new FakePi({
			script: [step("pi", undefined, { code: 2, stderr: "model failed" })],
			shouldRequireExpectedArgs: false,
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext();
		await handleHerdrTabGoal({
			herdr,
			tabId: "caller-tab",
			labelDeriver: goalLabelDeriver(pi),
			args: "ship auth",
			ctx,
			notifyProgress: () => {},
		});
		expect(herdr.renameTabCalls).toEqual([]);
		expect(notificationMessages(ctx).join("\n")).toContain("model failed");
		pi.assertDone();
	});

	test("tab:goal reports rename gateway failure", async () => {
		const pi = new FakePi({
			script: [step("pi", undefined, { stdout: "add-auth" })],
			shouldRequireExpectedArgs: false,
		});
		const herdr = new FakeHerdrGateway({
			renameTabResult: { type: "failed", message: "tab vanished" },
		});
		const ctx = new FakeCommandContext();
		await handleHerdrTabGoal({
			herdr,
			tabId: "caller-tab",
			labelDeriver: goalLabelDeriver(pi),
			args: "ship auth",
			ctx,
			notifyProgress: () => {},
		});
		expect(notificationMessages(ctx)).toContain("tab vanished");
		pi.assertDone();
	});

	test("tab:goal caller resolution failure stops before idle wait and model work", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane("no caller pane") });
		const ctx = new FakeCommandContext();
		registerHerdrTabGoalCommand({
			commands: createHerdrPiCommandApi(pi),
			git: new InMemoryGitGateway(),
			herdr,
			createProjectConfig: herdrTestProjectConfigFactory(pi),
		});
		await pi.commands.get("ns:herdr:tab:goal")?.handler("ship auth", ctx);
		expect(herdr.resolveCallerPaneCalls).toBe(1);
		expect(ctx.waitCount).toBe(0);
		expect(herdr.renameTabCalls).toEqual([]);
		expect(notificationMessages(ctx).join("\n")).toContain(
			"Not running inside a Herdr caller tab.",
		);
		expect(notificationMessages(ctx).join("\n")).toContain("no caller pane");
		pi.assertDone();
	});
});
