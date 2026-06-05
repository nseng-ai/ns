import { describe, expect, test } from "bun:test";

import handoffExtension, { buildHandoffTabPrompt, deriveSemanticHandoffSlug } from "../src/handoff.ts";
import {
	BRANCH,
	FakePi,
	branchStep,
	checkStep,
	cmuxCreateSurfaceStep,
	cmuxIdentifyStep,
	createContext,
	runCommand,
	skillCommandInfo,
	step,
	withTempSkill,
} from "./handoff-test-fakes.ts";

describe("handoff-tab extension", () => {
	test("registers handoff-tab command and launch tool when tool support exists", () => {
		const pi = new FakePi();

		handoffExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual(["handoff-tab", "handoff:create", "handoff:list", "handoff:pickup"]);
		expect([...pi.tools.keys()]).toEqual(["handoff_tab_launch"]);
		expect(pi.commands.get("handoff-tab")?.description).toBe("Create a handoff and open a focused cmux tab to pick it up.");
	});

	test("does not register handoff-tab when tool registration is unavailable", () => {
		const pi = new FakePi();
		(pi as unknown as { registerTool?: undefined }).registerTool = undefined;

		handoffExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual(["handoff:create", "handoff:list", "handoff:pickup"]);
		expect(pi.commands.has("handoff-tab")).toBe(false);
		expect([...pi.tools.keys()]).toEqual([]);
	});

	test("handoff-tab command queues save prompt with exact branch slug and launch tool instruction", async () => {
		await withTempSkill(async (skillPath) => {
			const result = await runCommand(
				"handoff-tab",
				"finish handoff tab implementation",
				[branchStep(), checkStep(BRANCH, "finish-handoff-tab-implementation.md", false), cmuxIdentifyStep()],
				{},
				[skillCommandInfo(skillPath)],
			);

			result.pi.assertDone();
			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.pi.execCalls.map((call) => [call.command, call.args])).toEqual([
				["git", ["branch", "--show-current"]],
				["brmem", ["check", "finish-handoff-tab-implementation.md", "--namespace", "handoffs", "--branch", BRANCH]],
				["cmux", ["identify", "--json", "--id-format", "both"]],
			]);
			expect(result.notifications).toEqual([
				{ message: "Starting handoff-tab workflow for finish-handoff-tab-implementation…", level: "info" },
			]);
			expect(result.statuses).toEqual(["checking handoff and cmux context…", undefined]);
			expect(result.pi.sentUserMessages).toHaveLength(1);
			const prompt = result.pi.sentUserMessages[0] ?? "";
			expect(prompt).toContain(`<skill name="handoff-save" location="${skillPath}">`);
			expect(prompt).toContain("finish handoff tab implementation");
			expect(prompt).toContain(`- Branch: ${BRANCH}`);
			expect(prompt).toContain("- Namespace: handoffs");
			expect(prompt).toContain("- Entry: finish-handoff-tab-implementation.md");
			expect(prompt).toContain("- Slug: finish-handoff-tab-implementation");
			expect(prompt).toContain("call the handoff_tab_launch tool with exactly");
			expect(prompt).toContain(JSON.stringify({ branch: BRANCH, slug: "finish-handoff-tab-implementation" }, null, 2));
			expect(prompt).toContain(`/handoff:pickup --branch ${BRANCH} finish-handoff-tab-implementation`);
		});
	});

	test("handoff-tab command stops on slug collision before cmux or save prompt", async () => {
		const result = await runCommand("handoff-tab", "finish handoff tab implementation", [
			branchStep(),
			checkStep(BRANCH, "finish-handoff-tab-implementation.md", true),
		]);

		result.pi.assertDone();
		expect(result.pi.execCalls.map((call) => call.command)).toEqual(["git", "brmem"]);
		expect(result.pi.sentUserMessages).toEqual([]);
		expect(result.notifications).toEqual([
			{
				message: `Handoff finish-handoff-tab-implementation already exists on branch ${BRANCH}. Rerun /handoff-tab with a more specific focus so a different slug is derived.`,
				level: "error",
			},
		]);
	});

	test("handoff-tab command fails clearly outside cmux before save prompt", async () => {
		const result = await runCommand("handoff-tab", "finish handoff tab implementation", [
			branchStep(),
			checkStep(BRANCH, "finish-handoff-tab-implementation.md", false),
			step("cmux", ["identify", "--json", "--id-format", "both"], { code: 2, stderr: "not in cmux" }),
		]);

		result.pi.assertDone();
		expect(result.pi.execCalls.map((call) => call.command)).toEqual(["git", "brmem", "cmux"]);
		expect(result.pi.sentUserMessages).toEqual([]);
		expect(result.notifications).toHaveLength(1);
		expect(result.notifications[0]?.level).toBe("error");
		expect(result.notifications[0]?.message).toContain("not in cmux");
	});

	test("handoff-tab launch tool opens a focused pickup cmux tab", async () => {
		const pi = new FakePi([
			checkStep(BRANCH, "finish-widget.md", true),
			cmuxIdentifyStep(),
			cmuxCreateSurfaceStep(),
			step("cmux", ["rename-tab", "--workspace", "workspace-1", "--surface", "surface-1", "--title", "handoff: finish-widget", "--window", "window-1"]),
			step("cmux", [
				"send",
				"--workspace",
				"workspace-1",
				"--surface",
				"surface-1",
				"--window",
				"window-1",
				"--",
				"pi --provider anthropic --model claude-sonnet --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'\n",
			]),
		]);
		handoffExtension(pi);
		const tool = pi.tools.get("handoff_tab_launch");
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error("handoff_tab_launch was not registered");
		}
		const context = createContext();
		context.ctx.model = { provider: "anthropic", id: "claude-sonnet" };
		const updates: unknown[] = [];

		const result = await tool.execute(
			"tool-call-1",
			{ branch: BRANCH, slug: "finish-widget" },
			undefined,
			(update) => updates.push(update),
			context.ctx,
		);

		pi.assertDone();
		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toContain("Opened handoff pickup tab.");
		expect(result.content[0]?.text).toContain("Command: pi --provider anthropic --model claude-sonnet --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'");
		expect(result.details).toEqual({
			type: "launched",
			branch: BRANCH,
			slug: "finish-widget",
			tabTitle: "handoff: finish-widget",
			surfaceId: "surface-1",
			workspaceId: "workspace-1",
			command: "pi --provider anthropic --model claude-sonnet --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'",
		});
		expect(updates).toHaveLength(5);
		expect(context.statuses).toEqual([
			"verifying saved handoff…",
			"resolving cmux caller…",
			"creating cmux tab…",
			"naming cmux tab…",
			"launching pickup Pi…",
			undefined,
		]);
	});

	test("handoff-tab launch tool stops before cmux when handoff is missing", async () => {
		const pi = new FakePi([checkStep(BRANCH, "missing.md", false)]);
		handoffExtension(pi);
		const tool = pi.tools.get("handoff_tab_launch");
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error("handoff_tab_launch was not registered");
		}
		const context = createContext();

		const result = await tool.execute("tool-call-1", { branch: BRANCH, slug: "missing" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["brmem"]);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toBe(`No handoff missing found on branch ${BRANCH}; no cmux tab was opened.`);
	});

	test("handoff-tab launch tool reports manual recovery when rename fails after surface creation", async () => {
		const pi = new FakePi([
			checkStep(BRANCH, "finish-widget.md", true),
			cmuxIdentifyStep(),
			cmuxCreateSurfaceStep(),
			step("cmux", ["rename-tab", "--workspace", "workspace-1", "--surface", "surface-1", "--title", "handoff: finish-widget", "--window", "window-1"], {
				code: 2,
				stderr: "rename failed",
			}),
		]);
		handoffExtension(pi);
		const tool = pi.tools.get("handoff_tab_launch");
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error("handoff_tab_launch was not registered");
		}
		const context = createContext();

		const result = await tool.execute("tool-call-1", { branch: BRANCH, slug: "finish-widget" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["brmem", "cmux", "cmux", "cmux"]);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("rename failed");
		expect(result.content[0]?.text).toContain("Created cmux surface: surface-1");
		expect(result.content[0]?.text).toContain(`Manual recovery: /handoff:pickup --branch ${BRANCH} finish-widget`);
	});

	test("handoff-tab launch tool reports manual recovery when sending launch command fails", async () => {
		const pi = new FakePi([
			checkStep(BRANCH, "finish-widget.md", true),
			cmuxIdentifyStep(),
			cmuxCreateSurfaceStep(),
			step("cmux", ["rename-tab", "--workspace", "workspace-1", "--surface", "surface-1", "--title", "handoff: finish-widget", "--window", "window-1"]),
			step("cmux", [
				"send",
				"--workspace",
				"workspace-1",
				"--surface",
				"surface-1",
				"--window",
				"window-1",
				"--",
				"pi --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'\n",
			], {
				code: 2,
				stderr: "send failed",
			}),
		]);
		handoffExtension(pi);
		const tool = pi.tools.get("handoff_tab_launch");
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error("handoff_tab_launch was not registered");
		}
		const context = createContext();

		const result = await tool.execute("tool-call-1", { branch: BRANCH, slug: "finish-widget" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["brmem", "cmux", "cmux", "cmux", "cmux"]);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("send failed");
		expect(result.content[0]?.text).toContain("Created cmux surface: surface-1");
		expect(result.content[0]?.text).toContain("Manual recovery: run pi --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'");
	});

	test("handoff-tab launch tool rejects non-flat semantic slugs before side effects", async () => {
		for (const slug of ["finish widget", "--flag", "foo.md", "foo/bar", "Foo", "foo_bar", "", "  "]) {
			const pi = new FakePi();
			handoffExtension(pi);
			const tool = pi.tools.get("handoff_tab_launch");
			expect(tool).toBeDefined();
			if (tool === undefined) {
				throw new Error("handoff_tab_launch was not registered");
			}

			const result = await tool.execute("tool-call-1", { branch: BRANCH, slug }, undefined, undefined, createContext().ctx);

			expect(pi.execCalls).toEqual([]);
			expect(result.isError).toBe(true);
		}
	});
});

describe("handoff-tab pure helpers", () => {
	test("derives concise flat semantic handoff slugs", () => {
		expect(deriveSemanticHandoffSlug("Finish handoff tab implementation!!!")).toBe("finish-handoff-tab-implementation");
		expect(deriveSemanticHandoffSlug("one two three four five six seven eight nine ten")).toBe("one-two-three-four-five-six-seven-eight");
		expect(deriveSemanticHandoffSlug("!!!")).toBeUndefined();
	});

	test("handoff-tab prompt pins identity and launch tool ordering", () => {
		const prompt = buildHandoffTabPrompt({
			skillBlock: "# handoff-save skill",
			focus: "finish the launch tool",
			branch: BRANCH,
			slug: "finish-launch-tool",
		});

		expect(prompt).toContain("# handoff-save skill");
		expect(prompt).toContain("This is a /handoff-tab request.");
		expect(prompt).toContain(`- Branch: ${BRANCH}`);
		expect(prompt).toContain("- Entry: finish-launch-tool.md");
		expect(prompt).toContain("After the `brmem put` succeeds, call the handoff_tab_launch tool");
		expect(prompt).toContain(JSON.stringify({ branch: BRANCH, slug: "finish-launch-tool" }, null, 2));
		expect(prompt).toContain(`/handoff:pickup --branch ${BRANCH} finish-launch-tool`);
	});
});
