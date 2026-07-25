import { describe, expect, test } from "vitest";

import { getCallerTabId } from "../src/core/sidebar.ts";
import { handleHerdrNewTab, handleHerdrTabGoal } from "../src/core/tab.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	gitRootStep,
	notificationMessages,
	ROOT,
	step,
} from "./herdr-test-harness.ts";

describe("Herdr tab resources", () => {
	test("getCallerTabId trims a present ID and rejects blank values", () => {
		expect(getCallerTabId({ HERDR_TAB_ID: "  t-1  " })).toBe("t-1");
		expect(getCallerTabId({ HERDR_TAB_ID: " \t " })).toBeUndefined();
		expect(getCallerTabId({})).toBeUndefined();
	});

	test("tab:new preflights caller workspace then creates a focused tab at cwd", async () => {
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: "/repo/package" });
		await handleHerdrNewTab({
			herdr,
			labelDeriver: { deriveLabel: async () => "review-api" },
			args: "review the API",
			ctx,
			notifyProgress: () => {},
			env: { HERDR_WORKSPACE_ID: "  w-1 " },
		});
		expect(herdr.createTabCalls).toEqual([
			{
				options: {
					workspaceId: "w-1",
					cwd: "/repo/package",
					shouldFocus: true,
					label: "review-api",
				},
			},
		]);
	});

	test("tab:new without a description creates an unlabeled focused tab", async () => {
		let derivations = 0;
		const herdr = new FakeHerdrGateway();
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
			env: { HERDR_WORKSPACE_ID: "w-1" },
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
			env: { HERDR_WORKSPACE_ID: "w-1" },
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
			env: { HERDR_WORKSPACE_ID: "w-1" },
		});
		expect(notificationMessages(ctx)).toContain("workspace disappeared");
	});

	test("tab:new missing workspace does no label or Herdr work", async () => {
		let derivations = 0;
		const herdr = new FakeHerdrGateway();
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
			env: {},
		});
		expect(derivations).toBe(0);
		expect(herdr.createTabCalls).toEqual([]);
	});

	test("tab:goal shares goal slug and slot-prefix policy but renames only caller tab", async () => {
		const pi = new FakePi({
			script: [gitRootStep(ROOT), step("pi", undefined, { stdout: "add-auth" })],
			shouldRequireExpectedArgs: false,
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-3",
		});
		await handleHerdrTabGoal({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			args: "ship auth",
			ctx,
			notifyProgress: () => {},
			env: { HERDR_TAB_ID: " t-9 " },
		});
		expect(herdr.renameTabCalls).toEqual([{ tabId: "t-9", label: "s3:add-auth" }]);
		expect(herdr.renameCalls).toEqual([]);
		expect(notificationMessages(ctx)).toContain("Applied Herdr tab goal label: s3:add-auth");
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
			env: { HERDR_TAB_ID: "t-1" },
		});
		expect(herdr.renameTabCalls).toEqual([{ tabId: "t-1", label: "interactive-goal" }]);
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
			env: { HERDR_TAB_ID: "t-1" },
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
			env: { HERDR_TAB_ID: "t-1" },
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
			env: { HERDR_TAB_ID: "t-1" },
		});
		expect(notificationMessages(ctx)).toContain("tab vanished");
		pi.assertDone();
	});

	test("tab:goal missing tab stops before model work", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext();
		await handleHerdrTabGoal({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			args: "ship auth",
			ctx,
			notifyProgress: () => {},
			env: { HERDR_TAB_ID: " " },
		});
		expect(herdr.renameTabCalls).toEqual([]);
		expect(notificationMessages(ctx)).toContain("Not running inside a Herdr caller tab.");
		pi.assertDone();
	});
});
