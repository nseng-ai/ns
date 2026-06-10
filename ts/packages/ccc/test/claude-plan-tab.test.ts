import { afterEach, describe, expect, test } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
	buildClaudePlanLaunchCommand,
	buildClaudePlanTabTitle,
	extractLastAssistantText,
	registerCccClaudePlanTabCommand,
} from "../src/cmux/claude-plan-tab.ts";
import { FakeCommandContext, FakePi, makeTempDir, notificationMessages, resetCmuxTestEnvironment, step } from "./ccc-test-harness.ts";

const SEED = "# Plan\n\nImplement the thing exactly.";
const PROMPT_FILE = "/tmp/seed plan's.md";

function assistantEntry(content: unknown): unknown {
	return {
		type: "message",
		message: {
			role: "assistant",
			content,
		},
	};
}

function userEntry(text: string): unknown {
	return {
		type: "message",
		message: {
			role: "user",
			content: [{ type: "text", text }],
		},
	};
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

function renameStep(title: string): ReturnType<typeof step> {
	return step("cmux", ["rename-tab", "--workspace", "workspace-1", "--surface", "surface-1", "--title", title, "--window", "window-1"], {});
}

function sendStep(command: string, result: { code?: number; stderr?: string } = {}): ReturnType<typeof step> {
	return step("cmux", ["send", "--workspace", "workspace-1", "--surface", "surface-1", "--window", "window-1", "--", `${command}\n`], result);
}

afterEach(resetCmuxTestEnvironment);

describe("claude plan tab", () => {
	test("extracts the last assistant text from session entries", () => {
		const entries = [
			assistantEntry([{ type: "text", text: "older" }]),
			userEntry("please update"),
			{ type: "custom", data: { role: "assistant" } },
			assistantEntry([
				{ type: "text", text: "first" },
				{ type: "image", url: "ignored" },
				{ type: "text", text: " second" },
			]),
		];

		expect(extractLastAssistantText(entries)).toBe("first second");
	});

	test("returns undefined for no usable assistant text", () => {
		expect(extractLastAssistantText([userEntry("hello")])).toBeUndefined();
		expect(extractLastAssistantText([assistantEntry([{ type: "text", text: "  \n" }])])).toBeUndefined();
		expect(extractLastAssistantText([{ type: "message", message: { role: "assistant", content: [{ type: "tool_use" }] } }])).toBeUndefined();
		expect(extractLastAssistantText([{ type: "message", message: { role: "assistant" } }])).toBeUndefined();
	});

	test("builds a Claude Code plan-mode launch command with file indirection", () => {
		expect(buildClaudePlanLaunchCommand(PROMPT_FILE)).toBe("claude --permission-mode plan \"$(cat '/tmp/seed plan'\\''s.md')\"");
	});

	test("builds deterministic tab titles from the first non-empty line", () => {
		expect(buildClaudePlanTabTitle("\n  Implement the widget\nMore detail")).toBe("claude-plan: Implement the widget");
		expect(buildClaudePlanTabTitle("123456789012345678901234567890123456789012345")).toBe("claude-plan: 123456789012345678901234567890123456789…");
	});

	test("writes the last assistant seed verbatim when invoked without arguments", async () => {
		const promptDir = await makeTempDir();
		const promptFile = join(promptDir, "123-claude-plan.md");
		const command = buildClaudePlanLaunchCommand(promptFile);
		const tabTitle = "claude-plan: # Plan";
		const pi = new FakePi({ script: [cmuxIdentifyStep(), cmuxCreateSurfaceStep(), renameStep(tabTitle), sendStep(command)] });
		registerCccClaudePlanTabCommand(pi, { promptDir, now: () => 123 });
		const ctx = new FakeCommandContext({ branchEntries: [userEntry("draft a plan"), assistantEntry([{ type: "text", text: SEED }])] });

		await pi.commands.get("ccc:claude-plan-tab")?.handler("", ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(1);
		expect(await readFile(promptFile, "utf8")).toBe(SEED);
		expect(pi.execCalls.at(-1)?.args.at(-1)).toBe(`${command}\n`);
		expect(notificationMessages(ctx).at(-1)).toContain("Opened Claude plan tab.");
		expect(notificationMessages(ctx).at(-1)).toContain(`Tab title: ${tabTitle}`);
		expect(notificationMessages(ctx).at(-1)).toContain("Surface: surface-1");
		expect(notificationMessages(ctx).at(-1)).toContain("Workspace: workspace-1");
		expect(notificationMessages(ctx).at(-1)).toContain(`Command: ${command}`);
	});

	test("uses a non-empty command argument as the seed instead of the last assistant message", async () => {
		const promptDir = await makeTempDir();
		const promptFile = join(promptDir, "123-claude-plan.md");
		const command = buildClaudePlanLaunchCommand(promptFile);
		const tabTitle = "claude-plan: Explicit plan";
		const pi = new FakePi({ script: [cmuxIdentifyStep(), cmuxCreateSurfaceStep(), renameStep(tabTitle), sendStep(command)] });
		registerCccClaudePlanTabCommand(pi, { promptDir, now: () => 123 });
		const ctx = new FakeCommandContext({ branchEntries: [assistantEntry([{ type: "text", text: SEED }])] });

		await pi.commands.get("ccc:claude-plan-tab")?.handler("Explicit plan", ctx);

		pi.assertDone();
		expect(await readFile(promptFile, "utf8")).toBe("Explicit plan");
		expect(notificationMessages(ctx).at(-1)).toContain(`Tab title: ${tabTitle}`);
	});

	test("fails before cmux when there is no argument or assistant seed", async () => {
		const promptDir = await makeTempDir();
		const pi = new FakePi();
		registerCccClaudePlanTabCommand(pi, { promptDir, now: () => 123 });
		const ctx = new FakeCommandContext({ branchEntries: [userEntry("hello")] });

		await pi.commands.get("ccc:claude-plan-tab")?.handler("   ", ctx);

		pi.assertDone();
		expect(pi.execCalls).toEqual([]);
		expect(await readdir(promptDir)).toEqual([]);
		expect(ctx.notifications).toEqual([
			{ message: "No assistant message found in this session to use as a seed plan.", level: "error" },
		]);
	});

	test("reports cmux caller identification failure", async () => {
		const promptDir = await makeTempDir();
		const pi = new FakePi({
			script: [step("cmux", ["identify", "--json", "--id-format", "both"], { code: 1, stderr: "not in cmux" })],
		});
		registerCccClaudePlanTabCommand(pi, { promptDir, now: () => 123 });
		const ctx = new FakeCommandContext({ branchEntries: [assistantEntry([{ type: "text", text: SEED }])] });

		await pi.commands.get("ccc:claude-plan-tab")?.handler("", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).at(-1)).toContain("not in cmux");
		expect(ctx.notifications.at(-1)?.level).toBe("error");
	});

	test("reports manual recovery when sending the launch command fails", async () => {
		const promptDir = await makeTempDir();
		const promptFile = join(promptDir, "123-claude-plan.md");
		const command = buildClaudePlanLaunchCommand(promptFile);
		const tabTitle = "claude-plan: # Plan";
		const pi = new FakePi({
			script: [cmuxIdentifyStep(), cmuxCreateSurfaceStep(), renameStep(tabTitle), sendStep(command, { code: 2, stderr: "send failed" })],
		});
		registerCccClaudePlanTabCommand(pi, { promptDir, now: () => 123 });
		const ctx = new FakeCommandContext({ branchEntries: [assistantEntry([{ type: "text", text: SEED }])] });

		await pi.commands.get("ccc:claude-plan-tab")?.handler("", ctx);

		pi.assertDone();
		const message = notificationMessages(ctx).at(-1) ?? "";
		expect(message).toContain("send failed");
		expect(message).toContain("Created cmux surface: surface-1");
		expect(message).toContain(`Manual recovery: run ${command}`);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
	});
});
