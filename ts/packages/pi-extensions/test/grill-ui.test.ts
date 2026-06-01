import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { buildGrillAskRows } from "../src/grill-ui/view.ts";
import type { SkillCommandInfo } from "../src/skill-expansion.ts";
import {
	GRILL_ASK_TOOL_NAME,
	GRILL_UI_COMMAND_NAME,
	GRILL_UI_SKILL_NAME,
	buildGrillUiPrompt,
	executeGrillAsk,
	registerGrillUiExtension,
	type ExtensionAPI,
	type GrillAskInput,
	type GrillAskUiRunner,
	type GrillAskToolContext,
	type GrillUiCommandContext,
	type ToolDefinition,
	type ToolResult,
} from "../src/grill-ui.ts";

const ROOT = "/repo";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
interface Notification {
	message: string;
	level: string | undefined;
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly tools = new Map<string, ToolDefinition>();
	readonly sentUserMessages: string[] = [];
	commandsList: SkillCommandInfo[] = [];

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	registerTool(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition);
	}

	getCommands(): readonly SkillCommandInfo[] {
		return this.commandsList;
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}
}

function register(pi = new FakePi()): { pi: FakePi; command: RegisteredCommand; tool: ToolDefinition } {
	registerGrillUiExtension(pi);
	const command = pi.commands.get(GRILL_UI_COMMAND_NAME);
	const tool = pi.tools.get(GRILL_ASK_TOOL_NAME);
	expect(command).toBeDefined();
	expect(tool).toBeDefined();
	return { pi, command: command!, tool: tool! };
}

function baseInput(): GrillAskInput {
	return {
		question: "How should we ship this UI improvement?",
		context: "The reasoning workflow is already valuable; answer capture is weak.",
		recommended: {
			answer: "Ship a focused extension.",
			rationale: "It preserves grill-me reasoning and improves only the interaction primitive.",
			optionValue: "focused-extension",
		},
		options: [
			{
				value: "focused-extension",
				label: "Ship a focused extension",
				description: "Improve only the question UI while keeping the skill workflow.",
			},
			{
				value: "generic-questionnaire",
				label: "Build a generic questionnaire first",
				description: "Prefer when multiple skills need the same UI immediately.",
			},
		],
	};
}

function nonUiContext(): GrillAskToolContext {
	return { hasUI: false, ui: {} };
}

function text(result: ToolResult): string {
	return result.content[0]?.text ?? "";
}

function commandContext(options: { hasUI?: boolean; editorResult?: string; notifications?: Notification[] } = {}): GrillUiCommandContext {
	return {
		hasUI: options.hasUI ?? true,
		ui: {
			editor: async () => options.editorResult,
			notify: (message, level) => options.notifications?.push({ message, level }),
		},
		waitForIdle: async () => {},
	};
}

describe("grill-ui prompt", () => {
	test("includes the expanded grill UI skill block when provided", () => {
		const skillBlock = `<skill name="${GRILL_UI_SKILL_NAME}">Ask one relentless question.</skill>`;
		const prompt = buildGrillUiPrompt(skillBlock, "Design target");

		expect(prompt).toContain(skillBlock);
		expect(prompt).toContain("Design target");
		expect(prompt).toContain("Use the grill_ask tool for every user-facing grill question");
		expect(prompt).toContain("Ask exactly one question per grill_ask call");
	});

	test("includes fallback grill instructions when no skill block is available", () => {
		const prompt = buildGrillUiPrompt(undefined, "Fallback target");

		expect(prompt).toContain("fallback=\"true\"");
		expect(prompt).toContain("Interview the user relentlessly");
		expect(prompt).toContain("Fallback target");
		expect(prompt).toContain("If grill_ask returns action: \"end_grill\"");
	});
});

describe("/grill-ui command", () => {
	test("with args sends exactly one user message containing the target and UI contract", async () => {
		const { pi, command } = register();

		await command.handler("  A short design prompt  ", commandContext({ hasUI: false }));

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("A short design prompt");
		expect(pi.sentUserMessages[0]).toContain("structured-grill-question-ui-contract");
		expect(pi.sentUserMessages[0]).toContain("grill_ask");
	});

	test("expands the pi-grill-ui skill when available", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-grill-ui-test-"));
		try {
			const skillPath = join(dir, "SKILL.md");
			await writeFile(
				skillPath,
				`---\nname: ${GRILL_UI_SKILL_NAME}\ndescription: test\n---\n\nBackend skill body from test.\n`,
				"utf8",
			);

			const { pi, command } = register();
			pi.commandsList = [
				{
					name: `skill:${GRILL_UI_SKILL_NAME}`,
					source: "skill",
					sourceInfo: { path: skillPath, baseDir: dir },
				},
			];

			await command.handler("Target design", commandContext({ hasUI: false }));

			expect(pi.sentUserMessages).toHaveLength(1);
			expect(pi.sentUserMessages[0]).toContain(`<skill name="${GRILL_UI_SKILL_NAME}" location="${skillPath}">`);
			expect(pi.sentUserMessages[0]).toContain("Backend skill body from test.");
			expect(pi.sentUserMessages[0]).toContain("Target design");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("without args uses the editor when UI is available", async () => {
		const { pi, command } = register();

		await command.handler("", commandContext({ editorResult: "Edited plan text" }));

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("Edited plan text");
	});

	test("without args and blank editor input notifies and sends no message", async () => {
		const { pi, command } = register();
		const notifications: Notification[] = [];

		await command.handler("", commandContext({ editorResult: "   ", notifications }));

		expect(pi.sentUserMessages).toEqual([]);
		expect(notifications).toEqual([{ message: "No plan/design provided for /grill-ui.", level: "warning" }]);
	});
});

describe("grill_ask validation", () => {
	test("rejects missing question, missing recommendation, duplicate values, reserved values, and invalid recommended option value", async () => {
		const cases: Array<{ name: string; params: unknown; expected: string }> = [
			{
				name: "missing question",
				params: { ...baseInput(), question: " " },
				expected: "question must be a non-empty string",
			},
			{
				name: "missing recommendation",
				params: { question: "Q?", options: baseInput().options },
				expected: "recommended must be an object",
			},
			{
				name: "duplicate values",
				params: {
					...baseInput(),
					options: [
						{ value: "same", label: "First" },
						{ value: "same", label: "Second" },
					],
				},
				expected: "duplicates same",
			},
			{
				name: "reserved values",
				params: {
					...baseInput(),
					options: [
						{ value: "__freeform__", label: "Reserved" },
						{ value: "other", label: "Other" },
					],
				},
				expected: "reserved value __freeform__",
			},
			{
				name: "invalid recommended option value",
				params: {
					...baseInput(),
					recommended: { answer: "Pick missing", optionValue: "missing" },
				},
				expected: "recommended.optionValue must match one of the option values",
			},
		];

		for (const item of cases) {
			const result = await executeGrillAsk(item.params, nonUiContext());
			expect(result.details, item.name).toMatchObject({ action: "invalid_tool_input" });
			expect(text(result), item.name).toContain(item.expected);
			expect(text(result), item.name).toContain("Repair the tool call");
		}
	});
});

describe("grill_ask execution", () => {
	test("non-UI path returns action ui_unavailable", async () => {
		const result = await executeGrillAsk(baseInput(), nonUiContext());

		expect(result.details).toEqual({ action: "ui_unavailable", question: "How should we ship this UI improvement?" });
		expect(text(result)).toContain("Structured grill question UI is unavailable");
		expect(text(result)).toContain("numbered choices");
	});

	test("choice path returns selected value, label, and recommended boolean", async () => {
		const titles: string[] = [];
		const result = await executeGrillAsk(baseInput(), {
			hasUI: true,
			ui: {
				select: async (title, options) => {
					titles.push(title);
					return options[0];
				},
				editor: async () => "unused",
			},
		});

		expect(titles[0]).toContain("How should we ship this UI improvement?");
		expect(titles[0]).toContain("Recommended answer");
		expect(result.details).toEqual({
			action: "answer",
			kind: "choice",
			question: "How should we ship this UI improvement?",
			value: "focused-extension",
			label: "Ship a focused extension",
			description: "Improve only the question UI while keeping the skill workflow.",
			recommended: true,
		});
		expect(text(result)).toContain("User selected option `focused-extension`: Ship a focused extension");
		expect(text(result)).toContain("Recommended option selected: true");
	});

	test("custom inline UI is preferred over legacy select/editor and returns a choice answer", async () => {
		const uiRunner: GrillAskUiRunner = async (input) => {
			expect(input.allowFreeform).toBe(true);
			const choice = buildGrillAskRows(input).find((row) => row.kind === "choice" && row.option.value === "generic-questionnaire");
			if (choice === undefined || choice.kind !== "choice") throw new Error("expected generic-questionnaire choice");
			return { action: "choice", entry: choice };
		};

		const result = await executeGrillAsk(
			baseInput(),
			{
				hasUI: true,
				ui: {
					custom: async <T>() => {
						throw new Error("inline UI runner test should not invoke fake custom directly");
					},
					select: async () => {
						throw new Error("legacy select should not be used when inline UI succeeds");
					},
					editor: async () => "unused",
				},
			},
			{ uiRunner },
		);

		expect(result.details).toMatchObject({
			action: "answer",
			kind: "choice",
			value: "generic-questionnaire",
			recommended: false,
		});
	});

	test("custom inline UI freeform answer does not call legacy editor", async () => {
		const result = await executeGrillAsk(
			baseInput(),
			{
				hasUI: true,
				ui: {
					custom: async <T>() => {
						throw new Error("inline UI runner test should not invoke fake custom directly");
					},
					editor: async () => {
						throw new Error("legacy editor should not be used for inline UI freeform");
					},
				},
			},
			{ uiRunner: async () => ({ action: "freeform", answer: " Inline UI answer. " }) },
		);

		expect(result.details).toEqual({
			action: "answer",
			kind: "freeform",
			question: "How should we ship this UI improvement?",
			answer: "Inline UI answer.",
		});
	});

	test("custom inline UI cancellation returns action cancelled", async () => {
		const result = await executeGrillAsk(
			baseInput(),
			{
				hasUI: true,
				ui: {
					custom: async <T>() => {
						throw new Error("inline UI runner test should not invoke fake custom directly");
					},
				},
			},
			{ uiRunner: async () => ({ action: "cancelled" }) },
		);

		expect(result.details).toEqual({ action: "cancelled", question: "How should we ship this UI improvement?" });
		expect(text(result)).toContain("Do not silently continue grilling");
	});

	test("inline UI failure falls back to legacy select/editor", async () => {
		const result = await executeGrillAsk(
			baseInput(),
			{
				hasUI: true,
				ui: {
					custom: async <T>() => {
						throw new Error("inline UI runtime unavailable");
					},
					select: async (_title, options) => options[0],
					editor: async () => "unused",
				},
			},
			{
				uiRunner: async () => {
					throw new Error("inline UI runtime unavailable");
				},
			},
		);

		expect(result.details).toMatchObject({
			action: "answer",
			kind: "choice",
			value: "focused-extension",
		});
	});

	test("freeform path calls editor and returns a freeform answer", async () => {
		const result = await executeGrillAsk(baseInput(), {
			hasUI: true,
			ui: {
				select: async (_title, options) => options.find((option) => option.includes("Other")),
				editor: async (title) => {
					expect(title).toBe("Freeform answer");
					return " Use an even smaller spike. ";
				},
			},
		});

		expect(result.details).toEqual({
			action: "answer",
			kind: "freeform",
			question: "How should we ship this UI improvement?",
			answer: "Use an even smaller spike.",
		});
		expect(text(result)).toContain("User provided a freeform answer: Use an even smaller spike.");
	});

	test("end path returns action end_grill and stop/summarize instruction", async () => {
		const result = await executeGrillAsk(baseInput(), {
			hasUI: true,
			ui: {
				select: async (_title, options) => options.find((option) => option.includes("End grilling")),
				editor: async () => "unused",
			},
		});

		expect(result.details).toEqual({ action: "end_grill", question: "How should we ship this UI improvement?" });
		expect(text(result)).toContain("Stop asking questions");
		expect(text(result)).toContain("summarize resolved decisions");
		expect(result.terminate).toBeUndefined();
	});

	test("selector cancellation returns action cancelled", async () => {
		const result = await executeGrillAsk(baseInput(), {
			hasUI: true,
			ui: {
				select: async () => undefined,
				editor: async () => "unused",
			},
		});

		expect(result.details).toEqual({ action: "cancelled", question: "How should we ship this UI improvement?" });
		expect(text(result)).toContain("Do not silently continue grilling");
	});
});

describe("registerGrillUiExtension", () => {
	test("registers one command named grill-ui and one tool named grill_ask", () => {
		const { pi, tool } = register();
		const schema = tool.parameters as { type?: string; required?: string[]; additionalProperties?: boolean };

		expect([...pi.commands.keys()]).toEqual([GRILL_UI_COMMAND_NAME]);
		expect([...pi.tools.keys()]).toEqual([GRILL_ASK_TOOL_NAME]);
		expect(schema.type).toBe("object");
		expect(schema.required).toEqual(["question", "recommended", "options"]);
		expect(schema.additionalProperties).toBe(false);
		expect(tool.promptGuidelines?.every((guideline) => guideline.includes(GRILL_ASK_TOOL_NAME))).toBe(true);
	});
});
