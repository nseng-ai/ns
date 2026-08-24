import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { withTempRepoSkill } from "@nseng-ai/foundation/test-kit";
import { evaluateGrillAttempt } from "@nseng-ai/pi-runtime/grill/surfaces";

import type { GrillUiCommandContext } from "../../src/grill/protocol.ts";
import {
	GRILL_ASK_ROUND_TOOL_NAME,
	GRILL_UI_COMMAND_NAME,
	GRILL_UI_SKILL_NAME,
	GRILL_WITH_DOCS_UI_COMMAND_NAME,
	GRILL_WITH_DOCS_UI_SKILL_NAME,
	GRILL_UI_CONTRACT,
	buildGrillUiPrompt,
	buildGrillWithDocsUiPrompt,
	registerGrillUiExtension,
	type ExtensionAPI,
	type ToolDefinition,
} from "../../src/grill/extension.ts";

const ROOT = resolve(import.meta.dirname, "../../../../../../../../..");
const FORMER_PREFIX_INPUTS = [
	["sq", ": ordinary inline text"].join(""),
	["side", "quest", ": ordinary inline text"].join(""),
] as const;

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
interface Notification {
	message: string;
	level: string | undefined;
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	/** Registered tool catalog, distinct from the active model-visible tool set. */
	readonly tools = new Map<string, ToolDefinition>();
	readonly sentUserMessages: string[] = [];
	readonly events: string[] = [];
	private readonly lifecycleHandlers = new Map<
		string,
		Array<(event: unknown, ctx: unknown) => unknown>
	>();
	private activeTools: string[];

	constructor(activeTools: string[] = []) {
		this.activeTools = [...activeTools];
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	registerTool(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition);
	}

	getActiveTools(): string[] {
		return [...this.activeTools];
	}

	setActiveTools(names: string[]): void {
		this.events.push(`set-active:${names.join(",")}`);
		this.activeTools = [...names];
	}

	on(event: string, handler: (event: unknown, ctx: unknown) => unknown): void {
		const handlers = this.lifecycleHandlers.get(event) ?? [];
		handlers.push(handler);
		this.lifecycleHandlers.set(event, handlers);
	}

	emitSessionStart(): void {
		for (const handler of this.lifecycleHandlers.get("session_start") ?? []) {
			handler({}, { hasUI: false, ui: {} });
		}
	}

	sendUserMessage(content: string): void {
		this.events.push("send");
		this.sentUserMessages.push(content);
	}
}

function register(pi = new FakePi()): {
	pi: FakePi;
	command: RegisteredCommand;
	grillCommand: RegisteredCommand;
	docsCommand: RegisteredCommand;
	tool: ToolDefinition;
} {
	registerGrillUiExtension(pi);
	const grillCommand = pi.commands.get(GRILL_UI_COMMAND_NAME);
	const docsCommand = pi.commands.get(GRILL_WITH_DOCS_UI_COMMAND_NAME);
	const tool = pi.tools.get(GRILL_ASK_ROUND_TOOL_NAME);
	expect(grillCommand).toBeDefined();
	expect(docsCommand).toBeDefined();
	expect(tool).toBeDefined();
	return {
		pi,
		command: grillCommand!,
		grillCommand: grillCommand!,
		docsCommand: docsCommand!,
		tool: tool!,
	};
}

function userMessage(content: unknown): unknown {
	return {
		type: "message",
		message: { role: "user", content },
	};
}

function commandContext(
	options: {
		hasUI?: boolean;
		editorResult?: string;
		onEditorTitle?: (title: string) => void;
		onNotification?: (notification: Notification) => void;
		cwd?: string;
		skill?: { name: string; filePath: string; baseDir: string } | null;
	} = {},
): GrillUiCommandContext {
	return {
		hasUI: options.hasUI ?? true,
		ui: {
			editor: async (title) => {
				options.onEditorTitle?.(title);
				return options.editorResult;
			},
			notify: (message, level) => options.onNotification?.({ message, level }),
		},
		getSystemPromptOptions: () => {
			const defaultSkills = [GRILL_UI_SKILL_NAME, GRILL_WITH_DOCS_UI_SKILL_NAME].map((name) => ({
				name,
				filePath: resolve(ROOT, ".agents/skills", name, "SKILL.md"),
				baseDir: resolve(ROOT, ".agents/skills", name),
			}));
			if (options.skill === null) return { skills: [] };
			return { skills: options.skill === undefined ? defaultSkills : [options.skill] };
		},
		waitForIdle: async () => {},
	};
}

describe("grill-ui prompt", () => {
	test("includes the expanded grill UI skill block when provided", () => {
		const skillBlock = `<skill name="${GRILL_UI_SKILL_NAME}">Ask one relentless question.</skill>`;
		const prompt = buildGrillUiPrompt(skillBlock, "Design target", "attempt-general");

		expect(prompt).toContain(skillBlock);
		expect(prompt).toContain("Design target");
		expect(prompt).toContain("whole current frontier");
		expect(prompt).toContain("decision-round mode");
		expect(prompt).toContain("General /pi grilling has no decision-round cap");
		expect(prompt).toContain("Do not ask routine validation-scope or test-coverage questions");
		expect(prompt).toContain("Final confirmation offers only");
		expect(prompt).toContain('"attemptId":"attempt-general"');
	});
});

describe("grill-with-docs-ui prompt", () => {
	test("includes the expanded docs-aware skill block when provided", () => {
		const skillBlock = `<skill name="${GRILL_WITH_DOCS_UI_SKILL_NAME}">Run docs-aware preflight and update CONTEXT.md.</skill>`;
		const prompt = buildGrillWithDocsUiPrompt(skillBlock, "Docs-aware target", "attempt-docs");

		expect(prompt).toContain(skillBlock);
		expect(prompt).toContain("Docs-aware target");
		expect(prompt).toContain("whole current frontier");
		expect(prompt).toContain("CONTEXT.md");
		expect(prompt).toContain("docs-aware preflight");
		expect(prompt).toContain("docs-aware preflight");
		expect(prompt).toContain('"attemptId":"attempt-docs"');
	});
});

describe("/pi:grill-me command", () => {
	test("with args sends exactly one user message containing the target and UI contract", async () => {
		const { pi, command } = register();

		await command.handler("  A short design prompt  ", commandContext({ hasUI: false }));

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("A short design prompt");
		expect(pi.sentUserMessages[0]).toContain("structured-grill-round-ui-contract");
		expect(pi.sentUserMessages[0]).toContain("grill_ask_round");
		expect(pi.sentUserMessages[0]).toMatch(
			/<ns-grill-kickoff>\{"version":1,"attemptId":"[^"]+","policy":\{"kind":"general"\}\}<\/ns-grill-kickoff>/u,
		);
	});

	test("expands the pi-grill-ui skill when available", async () => {
		await withTempRepoSkill(
			{
				skillName: GRILL_UI_SKILL_NAME,
				markdown: `---\nname: ${GRILL_UI_SKILL_NAME}\ndescription: test\n---\n\nBackend skill body from test.\n`,
				prefix: "pi-grill-ui-test-",
			},
			async ({ skillPath }) => {
				const { pi, command } = register();

				await command.handler(
					"Target design",
					commandContext({
						hasUI: false,
						skill: {
							name: GRILL_UI_SKILL_NAME,
							filePath: skillPath,
							baseDir: skillPath.replace(/\/SKILL\.md$/u, ""),
						},
					}),
				);

				expect(pi.sentUserMessages).toHaveLength(1);
				expect(pi.sentUserMessages[0]).toContain(
					`<skill name="${GRILL_UI_SKILL_NAME}" location="${skillPath}">`,
				);
				expect(pi.sentUserMessages[0]).toContain("Backend skill body from test.");
				expect(pi.sentUserMessages[0]).toContain("Target design");
			},
		);
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

		await command.handler(
			"",
			commandContext({
				editorResult: "   ",
				onNotification: (notification) => notifications.push(notification),
			}),
		);

		expect(pi.sentUserMessages).toEqual([]);
		expect(notifications).toEqual([
			{ message: "No plan/design provided for /pi:grill-me.", level: "warning" },
		]);
	});
});

describe("/pi:grill-with-docs command", () => {
	test("with args sends exactly one user message containing the target, UI contract, and docs guidance", async () => {
		const { pi, docsCommand } = register();

		await docsCommand.handler("  A docs-aware design prompt  ", commandContext({ hasUI: false }));

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("A docs-aware design prompt");
		expect(pi.sentUserMessages[0]).toContain("structured-grill-round-ui-contract");
		expect(pi.sentUserMessages[0]).toContain("grill_ask_round");
		expect(pi.sentUserMessages[0]).toContain("Docs-first preflight");
		expect(pi.sentUserMessages[0]).toContain("CONTEXT.md");
		expect(pi.sentUserMessages[0]).toContain("Offer an ADR only when");
		expect(pi.sentUserMessages[0]).toContain("Documentation updates");
	});

	test("expands the pi-grill-with-docs-ui skill when available", async () => {
		await withTempRepoSkill(
			{
				skillName: GRILL_WITH_DOCS_UI_SKILL_NAME,
				markdown: `---\nname: ${GRILL_WITH_DOCS_UI_SKILL_NAME}\ndescription: test\n---\n\nDocs-aware backend skill body from test.\n`,
				prefix: "pi-grill-with-docs-ui-test-",
			},
			async ({ skillPath }) => {
				const { pi, docsCommand } = register();

				await docsCommand.handler(
					"Target docs design",
					commandContext({
						hasUI: false,
						skill: {
							name: GRILL_WITH_DOCS_UI_SKILL_NAME,
							filePath: skillPath,
							baseDir: skillPath.replace(/\/SKILL\.md$/u, ""),
						},
					}),
				);

				expect(pi.sentUserMessages).toHaveLength(1);
				expect(pi.sentUserMessages[0]).toContain(
					`<skill name="${GRILL_WITH_DOCS_UI_SKILL_NAME}" location="${skillPath}">`,
				);
				expect(pi.sentUserMessages[0]).toContain("Docs-aware backend skill body from test.");
				expect(pi.sentUserMessages[0]).toContain("Target docs design");
			},
		);
	});

	test("without args uses the docs-aware editor title when UI is available", async () => {
		const { pi, docsCommand } = register();
		const editorTitles: string[] = [];

		await docsCommand.handler(
			"",
			commandContext({
				editorResult: "Edited docs plan text",
				onEditorTitle: (title) => editorTitles.push(title),
			}),
		);

		expect(editorTitles).toEqual(["What plan or design should be grilled against docs?"]);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("Edited docs plan text");
	});

	test("without args and blank editor input notifies and sends no message", async () => {
		const { pi, docsCommand } = register();
		const notifications: Notification[] = [];

		await docsCommand.handler(
			"",
			commandContext({
				editorResult: "   ",
				onNotification: (notification) => notifications.push(notification),
			}),
		);

		expect(pi.sentUserMessages).toEqual([]);
		expect(notifications).toEqual([
			{ message: "No plan/design provided for /pi:grill-with-docs.", level: "warning" },
		]);
	});
});

describe("registerGrillUiExtension", () => {
	test("registers plain and docs-aware commands and only the atomic round tool", () => {
		const { pi, tool } = register();
		const schema = tool.parameters as {
			type?: string;
			required?: string[];
			additionalProperties?: boolean;
		};

		expect([...pi.commands.keys()]).toEqual([
			GRILL_UI_COMMAND_NAME,
			GRILL_WITH_DOCS_UI_COMMAND_NAME,
		]);
		expect([...pi.tools.keys()]).toEqual([GRILL_ASK_ROUND_TOOL_NAME]);
		expect(schema.type).toBe("object");
		expect(schema.required).toBeUndefined();
		expect(schema).toHaveProperty("oneOf");
		// The grill contract lives in the self-contained kickoff prompts; the tool
		// definition must not carry active-only global prompt metadata.
		expect(tool.promptSnippet).toBeUndefined();
		expect(tool.promptGuidelines).toBeUndefined();

		const removedTerms = FORMER_PREFIX_INPUTS.map((input) => input.split(":")[0]);
		const metadata = JSON.stringify({
			contract: GRILL_UI_CONTRACT,
			description: tool.description,
			promptSnippet: tool.promptSnippet,
			promptGuidelines: tool.promptGuidelines,
		});
		for (const term of removedTerms) expect(metadata.toLowerCase()).not.toContain(term);
	});
});

describe("grill_ask_round activation lifecycle", () => {
	test("session_start removes only grill_ask_round from the active set", () => {
		const pi = new FakePi(["read", GRILL_ASK_ROUND_TOOL_NAME, "bash"]);
		register(pi);

		pi.emitSessionStart();

		expect(pi.tools.has(GRILL_ASK_ROUND_TOOL_NAME)).toBe(true);
		expect(pi.getActiveTools()).toEqual(["read", "bash"]);
	});

	test("session_start is a no-op when grill_ask_round is already inactive", () => {
		const pi = new FakePi(["read", "bash"]);
		register(pi);

		pi.emitSessionStart();

		expect(pi.getActiveTools()).toEqual(["read", "bash"]);
		expect(pi.events.filter((event) => event.startsWith("set-active"))).toEqual([]);
	});

	test("/pi:grill-me missing-skill failure does no editor work, activation, or send", async () => {
		const pi = new FakePi(["read", "bash"]);
		const { command } = register(pi);
		const editorTitles: string[] = [];
		const notifications: Notification[] = [];

		await command.handler(
			"",
			commandContext({
				skill: null,
				editorResult: "must not be read",
				onEditorTitle: (title) => editorTitles.push(title),
				onNotification: (notification) => notifications.push(notification),
			}),
		);

		expect(editorTitles).toEqual([]);
		expect(pi.getActiveTools()).toEqual(["read", "bash"]);
		expect(pi.events).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(notifications).toEqual([
			expect.objectContaining({
				level: "error",
				message: expect.stringContaining(`Could not load required skill "${GRILL_UI_SKILL_NAME}"`),
			}),
		]);
	});

	test("/pi:grill-me skill-expanded path activates grill_ask_round before sending", async () => {
		await withTempRepoSkill(
			{
				skillName: GRILL_UI_SKILL_NAME,
				markdown: `---\nname: ${GRILL_UI_SKILL_NAME}\ndescription: test\n---\n\nBody.\n`,
				prefix: "pi-grill-ui-activation-test-",
			},
			async ({ skillDir, skillPath }) => {
				const pi = new FakePi(["read"]);
				const { command } = register(pi);

				await command.handler(
					"Target design",
					commandContext({
						hasUI: false,
						skill: {
							name: GRILL_UI_SKILL_NAME,
							filePath: skillPath,
							baseDir: skillDir,
						},
					}),
				);

				expect(pi.getActiveTools()).toEqual(["read", GRILL_ASK_ROUND_TOOL_NAME]);
				expect(pi.events).toEqual([`set-active:read,${GRILL_ASK_ROUND_TOOL_NAME}`, "send"]);
			},
		);
	});

	test("/pi:grill-with-docs activates grill_ask_round before sending", async () => {
		const pi = new FakePi(["read"]);
		const { docsCommand } = register(pi);

		await docsCommand.handler("Docs target", commandContext({ hasUI: false }));

		expect(pi.getActiveTools()).toEqual(["read", GRILL_ASK_ROUND_TOOL_NAME]);
		expect(pi.events).toEqual([`set-active:read,${GRILL_ASK_ROUND_TOOL_NAME}`, "send"]);
	});

	test("repeated grill commands keep activation idempotent", async () => {
		const pi = new FakePi(["read"]);
		const { command, docsCommand } = register(pi);

		await command.handler("Target one", commandContext({ hasUI: false }));
		await docsCommand.handler("Target two", commandContext({ hasUI: false }));

		expect(pi.getActiveTools()).toEqual(["read", GRILL_ASK_ROUND_TOOL_NAME]);
		expect(pi.events.filter((event) => event.startsWith("set-active"))).toEqual([
			`set-active:read,${GRILL_ASK_ROUND_TOOL_NAME}`,
		]);
		const first = evaluateGrillAttempt([userMessage(pi.sentUserMessages[0])]);
		const second = evaluateGrillAttempt([userMessage(pi.sentUserMessages[1])]);
		expect(first.kickoff?.policy).toEqual({ kind: "general" });
		expect(second.kickoff?.policy).toEqual({ kind: "general" });
		expect(first.kickoff?.attemptId).not.toBe(second.kickoff?.attemptId);
	});

	test("blank or cancelled grill target does not activate the round tool", async () => {
		const pi = new FakePi(["read"]);
		const { command } = register(pi);

		await command.handler("", commandContext({ editorResult: "   " }));

		expect(pi.getActiveTools()).toEqual(["read"]);
		expect(pi.events.filter((event) => event.startsWith("set-active"))).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
	});
});
