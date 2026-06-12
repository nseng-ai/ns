import { describe, expect, test } from "vitest";

import { launchHandoffTab, type HandoffTabLaunchHost } from "../src/handoff-tab.ts";
import { FakeCommandContext, FakePi, step } from "./ccc-test-harness.ts";

const BRANCH = "feature/handoff";
const SLUG = "finish-widget";
const KEY = `${SLUG}.md`;
const PICKUP_COMMAND = `/handoff:pickup --branch ${BRANCH} ${SLUG}`;
const STATUS_KEY = "handoff-tab";

function params(): { branch: string; slug: string; key: string; pickupCommand: string } {
	return { branch: BRANCH, slug: SLUG, key: KEY, pickupCommand: PICKUP_COMMAND };
}

function cmuxIdentifyStep(): ReturnType<typeof step> {
	return step("cmux", ["identify", "--json", "--id-format", "both"], {
		stdout: JSON.stringify({ caller: { workspace_id: "workspace-1", pane_id: "pane-1", window_id: "window-1" } }),
	});
}

function cmuxCreateSurfaceStep(): ReturnType<typeof step> {
	return step(
		"cmux",
		[
			"--json",
			"new-surface",
			"--type",
			"terminal",
			"--workspace",
			"workspace-1",
			"--pane",
			"pane-1",
			"--focus",
			"true",
			"--window",
			"window-1",
		],
		{ stdout: JSON.stringify({ surface_id: "surface-1", workspace_id: "workspace-1" }) },
	);
}

function cmuxCreateSurfaceRefStep(): ReturnType<typeof step> {
	return step(
		"cmux",
		[
			"--json",
			"new-surface",
			"--type",
			"terminal",
			"--workspace",
			"workspace-1",
			"--pane",
			"pane-1",
			"--focus",
			"true",
			"--window",
			"window-1",
		],
		{
			stdout: JSON.stringify({
				pane_ref: "pane:1",
				surface_ref: "surface:1",
				type: "terminal",
				window_ref: "window:1",
				workspace_ref: "workspace:1",
			}),
		},
	);
}

function renameStep(surfaceId = "surface-1", workspaceId = "workspace-1"): ReturnType<typeof step> {
	return step("cmux", ["rename-tab", "--workspace", workspaceId, "--surface", surfaceId, "--title", `handoff: ${SLUG}`, "--window", "window-1"], {});
}

function sendStep(command: string, surfaceId = "surface-1", workspaceId = "workspace-1"): ReturnType<typeof step> {
	return step("cmux", ["send", "--workspace", workspaceId, "--surface", surfaceId, "--window", "window-1", "--", `${command}\n`], {});
}

describe("handoff-tab launch orchestration", () => {
	test("launches a focused pickup tab", async () => {
		const command = "pi --provider anthropic --model claude-sonnet-4-5 --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'";
		const pi = new FakePi({ script: [cmuxIdentifyStep(), cmuxCreateSurfaceStep(), renameStep(), sendStep(command)] });
		const ctx = new FakeCommandContext({ model: { provider: "anthropic", id: "claude-sonnet-4-5" } });
		const updates: unknown[] = [];

		const result = await launchHandoffTab({
			host: pi,
			cwd: ctx.cwd,
			model: ctx.model,
			hasUI: ctx.hasUI,
			ui: ctx.ui,
			statusKey: STATUS_KEY,
			params: params(),
			signal: undefined,
			onUpdate: (update) => updates.push(update),
		});

		pi.assertDone();
		expect(result).toEqual({
			type: "launched",
			branch: BRANCH,
			slug: SLUG,
			tabTitle: `handoff: ${SLUG}`,
			surfaceId: "surface-1",
			workspaceId: "workspace-1",
			command,
		});
		expect(updates).toEqual([
			{ content: [{ type: "text", text: "Resolving cmux caller context…" }] },
			{ content: [{ type: "text", text: "Creating focused cmux tab…" }] },
			{ content: [{ type: "text", text: "Naming cmux tab…" }] },
			{ content: [{ type: "text", text: "Launching pickup Pi…" }] },
		]);
		expect(ctx.statuses.map((status) => status.value)).toEqual([
			"resolving cmux caller…",
			"creating cmux tab…",
			"naming cmux tab…",
			"launching pickup Pi…",
			undefined,
		]);
	});

	test("accepts surface_ref and workspace_ref output from cmux new-surface", async () => {
		const command = "pi --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'";
		const pi = new FakePi({ script: [cmuxIdentifyStep(), cmuxCreateSurfaceRefStep(), renameStep("surface:1", "workspace:1"), sendStep(command, "surface:1", "workspace:1")] });
		const ctx = new FakeCommandContext();

		const result = await launchHandoffTab({
			host: pi,
			cwd: ctx.cwd,
			model: undefined,
			hasUI: ctx.hasUI,
			ui: ctx.ui,
			statusKey: STATUS_KEY,
			params: params(),
			signal: undefined,
			onUpdate: undefined,
		});

		pi.assertDone();
		expect(result).toMatchObject({ type: "launched", surfaceId: "surface:1", workspaceId: "workspace:1", command });
	});

	test("reports manual recovery when rename fails after surface creation", async () => {
		const command = "pi --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'";
		const pi = new FakePi({
			script: [
				cmuxIdentifyStep(),
				cmuxCreateSurfaceStep(),
				step("cmux", ["rename-tab", "--workspace", "workspace-1", "--surface", "surface-1", "--title", `handoff: ${SLUG}`, "--window", "window-1"], {
					code: 2,
					stderr: "rename failed",
				}),
			],
		});
		const ctx = new FakeCommandContext();

		const result = await launchHandoffTab({
			host: pi,
			cwd: ctx.cwd,
			model: undefined,
			hasUI: ctx.hasUI,
			ui: ctx.ui,
			statusKey: STATUS_KEY,
			params: params(),
			signal: undefined,
			onUpdate: undefined,
		});

		pi.assertDone();
		if (result.type !== "failed") {
			throw new Error("expected launch failure");
		}
		expect(result.message).toContain("rename failed");
		expect(result.message).toContain("Created cmux surface: surface-1");
		expect(result.message).toContain(`Manual recovery: run ${command}`);
	});

	test("reports manual recovery when sending the launch command fails", async () => {
		const command = "pi --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'";
		const pi = new FakePi({
			script: [
				cmuxIdentifyStep(),
				cmuxCreateSurfaceStep(),
				renameStep(),
				step("cmux", ["send", "--workspace", "workspace-1", "--surface", "surface-1", "--window", "window-1", "--", `${command}\n`], {
					code: 2,
					stderr: "send failed",
				}),
			],
		});
		const hostWithoutThinking: HandoffTabLaunchHost = { exec: (cmd, args, options) => pi.exec(cmd, args, options) };
		const ctx = new FakeCommandContext();

		const result = await launchHandoffTab({
			host: hostWithoutThinking,
			cwd: ctx.cwd,
			model: undefined,
			hasUI: ctx.hasUI,
			ui: ctx.ui,
			statusKey: STATUS_KEY,
			params: params(),
			signal: undefined,
			onUpdate: undefined,
		});

		pi.assertDone();
		if (result.type !== "failed") {
			throw new Error("expected launch failure");
		}
		expect(result.message).toContain("send failed");
		expect(result.message).toContain("Created cmux surface: surface-1");
		expect(result.message).toContain(`Manual recovery: run ${command}`);
	});

	test("preserves provider, model, and explicit thinking options in the generated Pi command", async () => {
		const command = "pi --provider openai-codex --model gpt-5.4-mini --thinking high '/handoff:pickup --branch feature/handoff finish-widget'";
		const pi = new FakePi({ script: [cmuxIdentifyStep(), cmuxCreateSurfaceStep(), renameStep(), sendStep(command)] });
		pi.setThinkingLevel("high");
		const ctx = new FakeCommandContext({ model: { provider: "openai-codex", id: "gpt-5.4-mini" } });

		const result = await launchHandoffTab({
			host: pi,
			cwd: ctx.cwd,
			model: ctx.model,
			hasUI: ctx.hasUI,
			ui: ctx.ui,
			statusKey: STATUS_KEY,
			params: params(),
			signal: undefined,
			onUpdate: undefined,
		});

		pi.assertDone();
		expect(result).toMatchObject({ type: "launched", command });
	});
});