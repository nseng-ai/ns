import { describe, expect, test } from "vitest";

import { handleHerdrNewTab, handleHerdrTabGoal } from "../src/core/tab.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	failedCallerPane,
	gitRootStep,
	notificationMessages,
	resolvedCallerPane,
	ROOT,
	step,
} from "./herdr-test-harness.ts";

describe("Herdr tab resources", () => {
	test("tab:new preflights caller workspace then creates an unprefixed focused tab at cwd", async () => {
		const herdr = new FakeHerdrGateway({ callerPaneResult: resolvedCallerPane("w-1") });
		const ctx = new FakeCommandContext({
			cwd: "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-3",
		});
		await handleHerdrNewTab({
			herdr,
			labelDeriver: { deriveLabel: async () => "review-api" },
			args: "review the API",
			ctx,
			notifyProgress: () => {},
		});
		expect(herdr.resolveCallerPaneCalls).toBe(1);
		expect(herdr.createTabCalls).toEqual([
			{
				options: {
					workspaceId: "w-1",
					cwd: "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-3",
					shouldFocus: true,
					label: "review-api",
				},
			},
		]);
	});

	test("tab:new presents one label-policy warning before label derivation completes", async () => {
		const herdr = new FakeHerdrGateway({ callerPaneResult: resolvedCallerPane("w-1") });
		const ctx = new FakeCommandContext();
		await handleHerdrNewTab({
			herdr,
			labelDeriver: {
				async deriveLabel(input) {
					input.onModelPolicyWarning?.("using built-in model policy");
					expect(herdr.createTabCalls).toEqual([]);
					return "review-api";
				},
			},
			args: "review the API",
			ctx,
			notifyProgress: () => {},
		});
		expect(ctx.notifications.filter((notification) => notification.level === "warning")).toEqual([
			{ message: "using built-in model policy", level: "warning" },
		]);
	});

	test("tab:new without a description creates an unlabeled focused tab", async () => {
		let derivations = 0;
		const herdr = new FakeHerdrGateway({ callerPaneResult: resolvedCallerPane("w-1") });
		const ctx = new FakeCommandContext({ cwd: "/repo/package" });
		await handleHerdrNewTab({
			herdr,
			labelDeriver: {
				deriveLabel: async () => {
					derivations += 1;
					return "unused";
				},
			},
			args: "  ",
			ctx,
			notifyProgress: () => {},
		});
		expect(derivations).toBe(0);
		expect(herdr.createTabCalls).toEqual([
			{ options: { workspaceId: "w-1", cwd: "/repo/package", shouldFocus: true } },
		]);
	});

	test("tab:new model failure happens before tab mutation", async () => {
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext();
		await handleHerdrNewTab({
			herdr,
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
			labelDeriver: { deriveLabel: async () => "unused" },
			args: "",
			ctx,
			notifyProgress: () => {},
		});
		expect(notificationMessages(ctx)).toContain("workspace disappeared");
	});

	test("tab:new caller resolution failure does no label or Herdr work", async () => {
		let derivations = 0;
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane() });
		const ctx = new FakeCommandContext();
		await handleHerdrNewTab({
			herdr,
			labelDeriver: {
				deriveLabel: async () => {
					derivations += 1;
					return "unused";
				},
			},
			args: "description",
			ctx,
			notifyProgress: () => {},
		});
		expect(derivations).toBe(0);
		expect(herdr.createTabCalls).toEqual([]);
		expect(notificationMessages(ctx).join("\n")).toContain(
			"Not running inside a Herdr caller space.",
		);
	});

	test("tab:goal uses an unprefixed goal slug and renames only caller tab", async () => {
		const pi = new FakePi({
			script: [gitRootStep(ROOT), step("pi", undefined, { stdout: "add-auth" })],
			shouldRequireExpectedArgs: false,
		});
		const herdr = new FakeHerdrGateway({
			callerPaneResult: resolvedCallerPane("caller-workspace", "t-9"),
		});
		const ctx = new FakeCommandContext({
			cwd: "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-3",
		});
		await handleHerdrTabGoal({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			args: "ship auth",
			ctx,
			notifyProgress: () => {},
		});
		expect(herdr.resolveCallerPaneCalls).toBe(1);
		expect(herdr.renameTabCalls).toEqual([{ tabId: "t-9", label: "add-auth" }]);
		expect(herdr.renameCalls).toEqual([]);
		expect(notificationMessages(ctx)).toContain("Applied Herdr tab goal label: add-auth");
		pi.assertDone();
	});

	test("tab:goal uses interactive fallback and cancel does not mutate", async () => {
		const pi = new FakePi({
			script: [gitRootStep(ROOT), step("pi", undefined, { stdout: "interactive-goal" })],
			shouldRequireExpectedArgs: false,
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ inputValues: ["  ship interactively  "] });
		await handleHerdrTabGoal({
			pi: createHerdrPiCommandApi(pi),
			herdr,
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
			pi: createHerdrPiCommandApi(cancelledPi),
			herdr: cancelledHerdr,
			args: "",
			ctx: cancelledCtx,
			notifyProgress: () => {},
		});
		expect(cancelledHerdr.renameTabCalls).toEqual([]);
		cancelledPi.assertDone();
	});

	test("tab:goal model failure happens before rename", async () => {
		const pi = new FakePi({
			script: [gitRootStep(ROOT), step("pi", undefined, { code: 2, stderr: "model failed" })],
			shouldRequireExpectedArgs: false,
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext();
		await handleHerdrTabGoal({
			pi: createHerdrPiCommandApi(pi),
			herdr,
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
			script: [gitRootStep(ROOT), step("pi", undefined, { stdout: "add-auth" })],
			shouldRequireExpectedArgs: false,
		});
		const herdr = new FakeHerdrGateway({
			renameTabResult: { type: "failed", message: "tab vanished" },
		});
		const ctx = new FakeCommandContext();
		await handleHerdrTabGoal({
			pi: createHerdrPiCommandApi(pi),
			herdr,
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
		await handleHerdrTabGoal({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			args: "ship auth",
			ctx,
			notifyProgress: () => {},
		});
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
