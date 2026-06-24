import { describe, expect, test } from "vitest";

import investigateExtension, {
	INVESTIGATE_COMMAND_NAME,
	INVESTIGATE_RESULT_MESSAGE_TYPE,
	buildInvestigationTitle,
	type InvestigateExtensionAPI,
} from "../src/investigate.ts";
import type { PiAgentDefinition } from "../src/pi-agent-definition.ts";
import type {
	CommandContext,
	CustomMessage,
	MessageRenderer,
	RenderTheme,
} from "../src/handoff/runtime-types.ts";

const ROOT = "/repo";
const DEFAULT_INVESTIGATOR_BODY = "You are a fixture investigator.\n\nPrompt:\n\n{{prompt}}";

type RegisteredCommand = Parameters<InvestigateExtensionAPI["registerCommand"]>[1];

interface NotifyRecord {
	message: string;
	level?: "info" | "warning" | "error";
}

class FakePi implements InvestigateExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly userMessages: string[] = [];
	readonly renderers = new Map<string, MessageRenderer>();

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(customType: string, renderer: MessageRenderer): void {
		this.renderers.set(customType, renderer);
	}

	sendUserMessage(content: string): void {
		this.userMessages.push(content);
	}
}

interface FakeCommandContext extends CommandContext {
	readonly notifications: NotifyRecord[];
	waitForIdleCount: number;
}

function makeContext(): FakeCommandContext {
	const notifications: NotifyRecord[] = [];
	const ctx: FakeCommandContext = {
		cwd: ROOT,
		hasUI: true,
		mode: "tui",
		notifications,
		waitForIdleCount: 0,
		ui: {
			notify(message, level): void {
				notifications.push({ message, ...(level === undefined ? {} : { level }) });
			},
		},
		async waitForIdle(): Promise<void> {
			this.waitForIdleCount += 1;
		},
	};
	return ctx;
}

function register(
	pi: FakePi,
	overrides: { definition?: PiAgentDefinition } = {},
): RegisteredCommand {
	investigateExtension(pi, {
		loadAgentDefinition: () => overrides.definition ?? fakeInvestigatorDefinition(),
	});
	const command = pi.commands.get(INVESTIGATE_COMMAND_NAME);
	if (command === undefined) {
		throw new Error(`Expected ${INVESTIGATE_COMMAND_NAME} command to be registered.`);
	}
	return command;
}

function fakeInvestigatorDefinition(
	overrides: { toolName?: string; body?: string } = {},
): PiAgentDefinition {
	return {
		schema: "sdl.pi-agent.v1",
		name: "investigator",
		toolName: overrides.toolName ?? INVESTIGATE_COMMAND_NAME,
		label: "Investigator",
		description: "Run a fixture investigation.",
		promptGuidelines: [],
		body: overrides.body ?? DEFAULT_INVESTIGATOR_BODY,
		filePath: "/fixture/.sdl/pi/agents/investigator.md",
	};
}

function identityTheme(): RenderTheme {
	return {
		fg(_color, text): string {
			return text;
		},
		bold(text): string {
			return text;
		},
	};
}

describe("investigate extension", () => {
	test("registers a bare in-process investigate command and legacy result renderer", () => {
		const pi = new FakePi();
		const command = register(pi);

		expect(pi.commands.has(INVESTIGATE_COMMAND_NAME)).toBe(true);
		expect(command.description).toContain("in this session");
		expect(command.description).not.toContain("subagent");
		expect(command.argumentHint).toBe("<investigation prompt>");
		expect(pi.renderers.has(INVESTIGATE_RESULT_MESSAGE_TYPE)).toBe(true);
	});

	test("blank prompt notifies usage and does not send a parent-session prompt", async () => {
		const pi = new FakePi();
		const command = register(pi);
		const ctx = makeContext();

		await command.handler("   ", ctx);

		expect(ctx.waitForIdleCount).toBe(1);
		expect(ctx.notifications).toEqual([
			{ message: "Usage: /investigate <prompt>", level: "error" },
		]);
		expect(pi.userMessages).toEqual([]);
	});

	test("runs in-process in the parent session", async () => {
		const pi = new FakePi();
		const command = register(pi);
		const ctx = makeContext();

		await command.handler("why does the dispatcher matter?", ctx);

		expect(pi.userMessages).toHaveLength(1);
		expect(pi.userMessages[0]).toContain("You are a fixture investigator.");
		expect(pi.userMessages[0]).toContain("why does the dispatcher matter?");
		expect(ctx.notifications).toEqual([
			{ message: "Investigating in the current session.", level: "info" },
		]);
	});

	test("subagent-looking flags are rejected instead of sent into parent context", async () => {
		const pi = new FakePi();
		const command = register(pi);
		const ctx = makeContext();

		await command.handler("--subagent why did this fail?", ctx);

		expect(pi.userMessages).toEqual([]);
		expect(ctx.notifications).toEqual([
			{
				message:
					"/investigate no longer supports out-of-process subagent mode; rerun without --subagent/--fork.",
				level: "error",
			},
		]);
	});

	test("fails fast when investigator definition declares a different tool name", async () => {
		const pi = new FakePi();
		const command = register(pi, {
			definition: fakeInvestigatorDefinition({ toolName: "other_tool" }),
		});
		const ctx = makeContext();

		await expect(command.handler("find facts", ctx)).rejects.toThrow(/declares toolName/);
	});

	test("collapses long legacy investigation result messages unless expanded", () => {
		const pi = new FakePi();
		register(pi);
		const renderer = pi.renderers.get(INVESTIGATE_RESULT_MESSAGE_TYPE);
		if (renderer === undefined) {
			throw new Error(`Expected ${INVESTIGATE_RESULT_MESSAGE_TYPE} renderer to be registered.`);
		}
		const content = Array.from({ length: 30 }, (_value, index) => `line-${index + 1}`).join("\n");
		const message: CustomMessage = {
			customType: INVESTIGATE_RESULT_MESSAGE_TYPE,
			content,
			display: true,
		};

		const collapsed = renderer(message, { expanded: false }, identityTheme()).render(120);
		const expanded = renderer(message, { expanded: true }, identityTheme()).render(120);

		expect(collapsed).toContain("line-24");
		expect(collapsed).not.toContain("line-25");
		expect(collapsed.at(-1)).toContain("Investigation result collapsed");
		expect(expanded).toHaveLength(30);
		expect(expanded).toContain("line-30");
		expect(expanded.join("\n")).not.toContain("Investigation result collapsed");
	});

	test("builds short progress titles", () => {
		expect(buildInvestigationTitle("  one two\nthree   four ")).toBe(
			"Investigation: one two three four",
		);
		expect(buildInvestigationTitle("one two three four five six seven eight nine ten eleven")).toBe(
			"Investigation: one two three four five six seven eight nine ten…",
		);
	});

	test("builds long progress titles with only one truncation ellipsis", () => {
		const title = buildInvestigationTitle(
			"supercalifragilisticexpialidocious pseudopseudohypoparathyroidism floccinaucinihilipilification antidisestablishmentarianism honorificabilitudinitatibus one two three four five six seven",
		);

		expect(title.length).toBeLessThanOrEqual(80);
		expect(title.endsWith("…")).toBe(true);
		expect(title).not.toMatch(/……$/u);
		expect(title).not.toMatch(/….+…$/u);
	});
});
