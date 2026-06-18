import { describe, expect, test } from "vitest";

import handoffExtension, {
	buildHandoffTabPrompt,
	deriveSemanticHandoffSlug,
} from "../src/handoff.ts";
import { buildSlugModelArgs, DEFAULT_FAST_MODEL } from "@asdl/plans";
import { buildHandoffContentSlugPrompt } from "../src/handoff/content-slug.ts";
import {
	BRANCH,
	FakePi,
	branchStep,
	checkStep,
	cmuxCreateSurfaceRefStep,
	cmuxCreateSurfaceStep,
	cmuxIdentifyStep,
	createContext,
	runCommand,
	skillCommandInfo,
	step,
	withTempSkill,
} from "./handoff-test-fakes.ts";

const HANDOFF_CONTENT = `# Handoff: Associate Sessions With Branches

Continuation focus: Explore how to associate sessions with git branches.

## Next Steps

Design a branch-session association model.
`;

describe("handoff-tab extension", () => {
	test("registers handoff-tab command and launch tool when tool support exists", () => {
		const pi = new FakePi();

		handoffExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual([
			"ccc:handoff-tab",
			"handoff:create",
			"handoff:list",
			"handoff:pickup",
			"handoff:self",
		]);
		expect([...pi.tools.keys()]).toEqual([
			"derive_handoff_slug_from_content",
			"handoff_tab_launch",
			"handoff_self_queue_pickup",
		]);
		expect(pi.commands.get("ccc:handoff-tab")?.description).toBe(
			"Create a handoff and open a focused cmux tab to pick it up.",
		);
	});

	test("does not register handoff-tab when tool registration is unavailable", () => {
		const pi = new FakePi();
		Object.defineProperty(pi, "registerTool", { value: undefined });

		handoffExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual([
			"handoff:create",
			"handoff:list",
			"handoff:pickup",
		]);
		expect(pi.commands.has("ccc:handoff-tab")).toBe(false);
		expect([...pi.tools.keys()]).toEqual([]);
	});

	test("handoff-tab command queues create prompt with content-derived slug instructions", async () => {
		await withTempSkill(async (skillPath, repoDir) => {
			const result = await runCommand(
				"ccc:handoff-tab",
				"finish handoff tab implementation",
				[branchStep(), cmuxIdentifyStep()],
				{ cwd: repoDir },
				[skillCommandInfo(skillPath)],
			);

			result.pi.assertDone();
			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.pi.execCalls.map((call) => [call.command, call.args])).toEqual([
				["git", ["branch", "--show-current"]],
				["cmux", ["identify", "--json", "--id-format", "both"]],
			]);
			expect(result.notifications).toEqual([
				{ message: "Starting ccc:handoff-tab workflow with content-derived slug…", level: "info" },
			]);
			expect(result.statuses).toEqual(["checking cmux context…", undefined]);
			expect(result.pi.sentUserMessages).toHaveLength(1);
			expect(result.pi.sentUserMessageCalls[0]?.options).toEqual({ deliverAs: "followUp" });
			const prompt = result.pi.sentUserMessages[0] ?? "";
			expect(prompt).toContain(`<skill name="handoff-create" location="${skillPath}">`);
			expect(prompt).toContain("finish handoff tab implementation");
			expect(prompt).toContain(`- Branch: ${BRANCH}`);
			expect(prompt).toContain("- Namespace: handoff");
			expect(prompt).toContain("derive_handoff_slug_from_content");
			expect(prompt).not.toContain("finish-handoff-tab-implementation.md");
			expect(prompt).toContain("Do not derive the entry name from the raw continuation focus.");
			expect(prompt).toContain(`brmem check <returned-key> --namespace handoff --branch ${BRANCH}`);
			expect(prompt).toContain(
				"After `brmem put` succeeds, call handoff_tab_launch with `branch` set",
			);
			expect(prompt).toContain(`/handoff:pickup --branch ${BRANCH} <returned-slug>`);
		});
	});

	test("handoff-tab command delegates slug collision handling to generated prompt", async () => {
		const result = await runCommand("ccc:handoff-tab", "finish handoff tab implementation", [
			branchStep(),
			cmuxIdentifyStep(),
		]);

		result.pi.assertDone();
		expect(result.pi.execCalls.map((call) => call.command)).toEqual(["git", "cmux"]);
		expect(result.notifications).toEqual([
			{
				message:
					"handoff-create skill was not found; using fallback ccc:handoff-tab workflow prompt for a content-derived slug.",
				level: "warning",
			},
		]);
		expect(result.pi.sentUserMessages).toHaveLength(1);
		const prompt = result.pi.sentUserMessages[0] ?? "";
		expect(prompt).toContain(
			"Check for an existing artifact with `brmem check <returned-key> --namespace handoff",
		);
		expect(prompt).toContain("If it exists, stop; do not overwrite and do not open a cmux tab.");
	});

	test("handoff-tab command fails clearly outside cmux before create prompt", async () => {
		const result = await runCommand("ccc:handoff-tab", "finish handoff tab implementation", [
			branchStep(),
			step("cmux", ["identify", "--json", "--id-format", "both"], {
				code: 2,
				stderr: "not in cmux",
			}),
		]);

		result.pi.assertDone();
		expect(result.pi.execCalls.map((call) => call.command)).toEqual(["git", "cmux"]);
		expect(result.pi.sentUserMessages).toEqual([]);
		expect(result.notifications).toHaveLength(1);
		expect(result.notifications[0]?.level).toBe("error");
		expect(result.notifications[0]?.message).toContain("not in cmux");
	});

	test("derive handoff slug tool returns slug and key details", async () => {
		const pi = new FakePi([
			step("pi", buildSlugModelArgs(buildHandoffContentSlugPrompt(HANDOFF_CONTENT)), {
				stdout: "associate-sessions-with-branches\n",
			}),
		]);
		handoffExtension(pi);
		const tool = pi.tools.get("derive_handoff_slug_from_content");
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error("derive_handoff_slug_from_content was not registered");
		}
		const context = createContext();

		const result = await tool.execute(
			"tool-call-1",
			{ content: HANDOFF_CONTENT },
			undefined,
			undefined,
			context.ctx,
		);

		pi.assertDone();
		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toContain("Slug: associate-sessions-with-branches");
		expect(result.content[0]?.text).toContain("Entry: associate-sessions-with-branches.md");
		expect(result.details).toEqual({
			type: "derived",
			slug: "associate-sessions-with-branches",
			key: "associate-sessions-with-branches.md",
			provider: DEFAULT_FAST_MODEL.provider,
			model: DEFAULT_FAST_MODEL.modelId,
		});
		expect(context.statuses).toEqual(["deriving handoff slug…", undefined]);
	});

	test("derive handoff slug tool rejects invalid params before side effects", async () => {
		const pi = new FakePi();
		handoffExtension(pi);
		const tool = pi.tools.get("derive_handoff_slug_from_content");
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error("derive_handoff_slug_from_content was not registered");
		}

		for (const params of [
			undefined,
			null,
			{},
			{ content: "" },
			{ content: "   " },
			{ content: 123 },
		]) {
			const result = await tool.execute(
				"tool-call-1",
				params,
				undefined,
				undefined,
				createContext().ctx,
			);

			expect(result.isError).toBe(true);
		}
		expect(pi.execCalls).toEqual([]);
	});

	test("derive handoff slug tool reports slug-model failure without fallback", async () => {
		const pi = new FakePi([
			step("pi", buildSlugModelArgs(buildHandoffContentSlugPrompt(HANDOFF_CONTENT)), {
				code: 1,
				stderr: "model unavailable",
			}),
		]);
		handoffExtension(pi);
		const tool = pi.tools.get("derive_handoff_slug_from_content");
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error("derive_handoff_slug_from_content was not registered");
		}

		const result = await tool.execute(
			"tool-call-1",
			{ content: HANDOFF_CONTENT },
			undefined,
			undefined,
			createContext().ctx,
		);

		pi.assertDone();
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain(
			"Failed to derive handoff slug from final artifact content.",
		);
		expect(result.content[0]?.text).toContain("model unavailable");
		expect(result.content[0]?.text).toContain(
			"No continuation-focus or deterministic fallback was attempted.",
		);
	});

	test("derive handoff slug tool threads cwd and abort signal into model command", async () => {
		const pi = new FakePi([
			step("pi", buildSlugModelArgs(buildHandoffContentSlugPrompt(HANDOFF_CONTENT)), {
				stdout: "associate-sessions-with-branches\n",
			}),
		]);
		handoffExtension(pi);
		const tool = pi.tools.get("derive_handoff_slug_from_content");
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error("derive_handoff_slug_from_content was not registered");
		}
		const signal = new AbortController().signal;

		await tool.execute(
			"tool-call-1",
			{ content: HANDOFF_CONTENT },
			signal,
			undefined,
			createContext().ctx,
		);

		pi.assertDone();
		expect(pi.execCalls[0]?.options).toMatchObject({ cwd: "/repo", timeout: 60_000, signal });
	});

	test("handoff-tab launch tool opens a focused pickup cmux tab", async () => {
		const pi = new FakePi([
			checkStep(BRANCH, "finish-widget.md", true),
			cmuxIdentifyStep(),
			cmuxCreateSurfaceStep(),
			step("cmux", [
				"rename-tab",
				"--workspace",
				"workspace-1",
				"--surface",
				"surface-1",
				"--title",
				"handoff: finish-widget",
				"--window",
				"window-1",
			]),
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
		expect(result.content[0]?.text).toContain(
			"Command: pi --provider anthropic --model claude-sonnet --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'",
		);
		expect(result.details).toEqual({
			type: "launched",
			branch: BRANCH,
			slug: "finish-widget",
			tabTitle: "handoff: finish-widget",
			surfaceId: "surface-1",
			workspaceId: "workspace-1",
			command:
				"pi --provider anthropic --model claude-sonnet --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'",
		});
		expect(updates).toHaveLength(5);
		expect(context.statuses).toEqual([
			"verifying saved handoff…",
			undefined,
			"resolving cmux caller…",
			"creating cmux tab…",
			"naming cmux tab…",
			"launching pickup Pi…",
			undefined,
		]);
	});

	test("handoff-tab launch tool accepts current cmux surface ref output", async () => {
		const pi = new FakePi([
			checkStep(BRANCH, "finish-widget.md", true),
			cmuxIdentifyStep(),
			cmuxCreateSurfaceRefStep(),
			step("cmux", [
				"rename-tab",
				"--workspace",
				"workspace:1",
				"--surface",
				"surface:1",
				"--title",
				"handoff: finish-widget",
				"--window",
				"window-1",
			]),
			step("cmux", [
				"send",
				"--workspace",
				"workspace:1",
				"--surface",
				"surface:1",
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

		const result = await tool.execute(
			"tool-call-1",
			{ branch: BRANCH, slug: "finish-widget" },
			undefined,
			undefined,
			context.ctx,
		);

		pi.assertDone();
		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toContain("Opened handoff pickup tab.");
		expect(result.details).toEqual({
			type: "launched",
			branch: BRANCH,
			slug: "finish-widget",
			tabTitle: "handoff: finish-widget",
			surfaceId: "surface:1",
			workspaceId: "workspace:1",
			command:
				"pi --provider anthropic --model claude-sonnet --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'",
		});
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

		const result = await tool.execute(
			"tool-call-1",
			{ branch: BRANCH, slug: "missing" },
			undefined,
			undefined,
			context.ctx,
		);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["brmem"]);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toBe(
			`No handoff missing found on branch ${BRANCH}; no cmux tab was opened.`,
		);
	});

	test("handoff-tab launch tool reports brmem check failures instead of treating exit 1 tracebacks as missing", async () => {
		const pi = new FakePi([
			step(
				"brmem",
				[
					"check",
					"finish-widget.md",
					"--namespace",
					"handoff",
					"--branch",
					BRANCH,
					"--format",
					"json",
				],
				{
					code: 1,
					stderr:
						"Traceback (most recent call last):\nModuleNotFoundError: No module named 'brmem'\n",
				},
			),
		]);
		handoffExtension(pi);
		const tool = pi.tools.get("handoff_tab_launch");
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error("handoff_tab_launch was not registered");
		}
		const context = createContext();

		const result = await tool.execute(
			"tool-call-1",
			{ branch: BRANCH, slug: "finish-widget" },
			undefined,
			undefined,
			context.ctx,
		);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["brmem"]);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("brmem check failed");
		expect(result.content[0]?.text).toContain("ModuleNotFoundError");
		expect(result.content[0]?.text).not.toContain("No handoff finish-widget found");
	});

	test("handoff-tab launch tool reports manual recovery when rename fails after surface creation", async () => {
		const pi = new FakePi([
			checkStep(BRANCH, "finish-widget.md", true),
			cmuxIdentifyStep(),
			cmuxCreateSurfaceStep(),
			step(
				"cmux",
				[
					"rename-tab",
					"--workspace",
					"workspace-1",
					"--surface",
					"surface-1",
					"--title",
					"handoff: finish-widget",
					"--window",
					"window-1",
				],
				{
					code: 2,
					stderr: "rename failed",
				},
			),
		]);
		handoffExtension(pi);
		const tool = pi.tools.get("handoff_tab_launch");
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error("handoff_tab_launch was not registered");
		}
		const context = createContext();

		const result = await tool.execute(
			"tool-call-1",
			{ branch: BRANCH, slug: "finish-widget" },
			undefined,
			undefined,
			context.ctx,
		);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["brmem", "cmux", "cmux", "cmux"]);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("rename failed");
		expect(result.content[0]?.text).toContain("Created cmux surface: surface-1");
		expect(result.content[0]?.text).toContain(
			"Manual recovery: run pi --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'",
		);
	});

	test("handoff-tab launch tool reports manual recovery when sending launch command fails", async () => {
		const pi = new FakePi([
			checkStep(BRANCH, "finish-widget.md", true),
			cmuxIdentifyStep(),
			cmuxCreateSurfaceStep(),
			step("cmux", [
				"rename-tab",
				"--workspace",
				"workspace-1",
				"--surface",
				"surface-1",
				"--title",
				"handoff: finish-widget",
				"--window",
				"window-1",
			]),
			step(
				"cmux",
				[
					"send",
					"--workspace",
					"workspace-1",
					"--surface",
					"surface-1",
					"--window",
					"window-1",
					"--",
					"pi --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'\n",
				],
				{
					code: 2,
					stderr: "send failed",
				},
			),
		]);
		handoffExtension(pi);
		const tool = pi.tools.get("handoff_tab_launch");
		expect(tool).toBeDefined();
		if (tool === undefined) {
			throw new Error("handoff_tab_launch was not registered");
		}
		const context = createContext();

		const result = await tool.execute(
			"tool-call-1",
			{ branch: BRANCH, slug: "finish-widget" },
			undefined,
			undefined,
			context.ctx,
		);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual([
			"brmem",
			"cmux",
			"cmux",
			"cmux",
			"cmux",
		]);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("send failed");
		expect(result.content[0]?.text).toContain("Created cmux surface: surface-1");
		expect(result.content[0]?.text).toContain(
			"Manual recovery: run pi --thinking medium '/handoff:pickup --branch feature/handoff finish-widget'",
		);
	});

	test("handoff-tab launch tool rejects non-flat semantic slugs before side effects", async () => {
		for (const slug of [
			"finish widget",
			"--flag",
			"foo.md",
			"foo/bar",
			"Foo",
			"foo_bar",
			"",
			"  ",
		]) {
			const pi = new FakePi();
			handoffExtension(pi);
			const tool = pi.tools.get("handoff_tab_launch");
			expect(tool).toBeDefined();
			if (tool === undefined) {
				throw new Error("handoff_tab_launch was not registered");
			}

			const result = await tool.execute(
				"tool-call-1",
				{ branch: BRANCH, slug },
				undefined,
				undefined,
				createContext().ctx,
			);

			expect(pi.execCalls).toEqual([]);
			expect(result.isError).toBe(true);
		}
	});
});

describe("handoff-tab pure helpers", () => {
	test("legacy focus slug helper remains deterministic but is not used by handoff-tab identity selection", () => {
		expect(deriveSemanticHandoffSlug("Finish handoff tab implementation!!!")).toBe(
			"finish-handoff-tab-implementation",
		);
		expect(deriveSemanticHandoffSlug("one two three four five six seven eight nine ten")).toBe(
			"one-two-three-four-five-six-seven-eight",
		);
		expect(deriveSemanticHandoffSlug("!!!")).toBeUndefined();
	});

	test("handoff-tab prompt requires content-derived slug and launch tool ordering", () => {
		const prompt = buildHandoffTabPrompt({
			skillBlock: "# handoff-create skill",
			request: { focus: "finish the launch tool", branch: BRANCH },
		});

		expect(prompt).toContain("# handoff-create skill");
		expect(prompt).toContain("This is a /ccc:handoff-tab request.");
		expect(prompt).toContain(`- Branch: ${BRANCH}`);
		expect(prompt).toContain(
			"- Entry: derive from the final Markdown handoff content with derive_handoff_slug_from_content",
		);
		expect(prompt).toContain("Do not derive the entry name from the raw continuation focus.");
		expect(prompt).toContain("If it exists, stop; do not overwrite and do not open a cmux tab.");
		expect(prompt).toContain(
			"After `brmem put` succeeds, call handoff_tab_launch with `branch` set",
		);
		expect(prompt).toContain("`slug` set to the slug returned by derive_handoff_slug_from_content");
		expect(prompt).toContain(`/handoff:pickup --branch ${BRANCH} <returned-slug>`);
	});
});
