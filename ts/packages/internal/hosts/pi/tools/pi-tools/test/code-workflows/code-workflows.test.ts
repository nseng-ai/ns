import { describe, expect, test } from "vitest";

import { IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE } from "@nseng-ai/pi-runtime/commands/ack";
import type { CommandContext, CustomMessage } from "@nseng-ai/pi-runtime/runtime/extension-types";

import codeWorkflowsExtension, {
	CODE_WORKFLOWS_COMMAND_NAME,
	CODE_WORKFLOWS_MESSAGE_TYPE,
	CODE_WORKFLOW_ROUTES,
	GH_CI_DEBUG_COMMAND_NAME,
	buildGhCiDebugPrompt,
	completeWorkflowRoute,
	formatWorkflowMenu,
	resolveWorkflowRoute,
	type CodeWorkflowsExtensionAPI,
	type InvokeCodeWorkflowPromptTurn,
} from "../../src/code-workflows/extension.ts";
import { createTestSessionReader } from "../test-session-reader.ts";

type RegisteredCommand = Parameters<CodeWorkflowsExtensionAPI["registerCommand"]>[1];

const EXPECTED_ROUTES = [
	{
		route: "delete-stack",
		alias: "gt-delete-stack",
		reference: ".agents/skills/code-workflows/references/delete-stack.md",
		menuVisibility: "visible",
	},
	{
		route: "stackify-branch",
		alias: "gt-stackify-branch",
		reference: ".agents/skills/code-workflows/references/gt-stackify-branch.md",
		menuVisibility: "visible",
	},
	{
		route: "stacker-agent",
		alias: "stacker",
		reference: ".agents/skills/code-workflows/references/stacker-agent.md",
		menuVisibility: "visible",
	},
	{
		route: "parity-review",
		alias: "cross-harness-parity",
		reference: ".agents/skills/code-workflows/references/parity-review.md",
		menuVisibility: "visible",
	},
	{
		route: "gh-ci-debug",
		alias: "ci-debug",
		reference: ".agents/skills/code-workflows/references/gh-ci-debug.md",
		menuVisibility: "explicit-only",
	},
] as const;

class FakePi implements CodeWorkflowsExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messages: CustomMessage[] = [];
	readonly renderers = new Map<string, unknown>();
	readonly sentUserMessages: string[] = [];
	readonly events: string[];

	constructor(events: string[] = []) {
		this.events = events;
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(customType: string, renderer: unknown): void {
		this.renderers.set(customType, renderer);
	}

	sendMessage(message: CustomMessage): void {
		this.messages.push(message);
		this.events.push(`message:${message.customType}`);
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
		this.events.push("send-user-message");
	}
}

class FakeCommandContext implements CommandContext {
	readonly cwd: string;
	readonly mode = "tui";
	readonly hasUI: boolean;
	readonly selectedLabels: string[];
	readonly notifications: Array<{
		message: string;
		level: "info" | "warning" | "error" | undefined;
	}> = [];
	readonly events: string[];
	editorText: string | undefined;
	waitForIdleCalls = 0;

	readonly sessionManager = createTestSessionReader();
	readonly ui: CommandContext["ui"];

	constructor(
		options: {
			cwd?: string;
			hasUI?: boolean;
			selectedLabels?: string[];
			events?: string[];
		} = {},
	) {
		this.cwd = options.cwd ?? "/repo";
		this.hasUI = options.hasUI ?? true;
		this.selectedLabels = [...(options.selectedLabels ?? [])];
		this.events = options.events ?? [];
		this.ui = {
			notify: (message, level) => {
				this.notifications.push({ message, level });
			},
			select: async (_title, _items) => this.selectedLabels.shift(),
			setEditorText: (value) => {
				this.editorText = value;
			},
		};
	}

	async waitForIdle(): Promise<void> {
		this.waitForIdleCalls += 1;
		this.events.push("wait-for-idle");
	}
}

function fakePromptTurn(
	options: { skillBlock?: string; events?: string[] } = {},
): InvokeCodeWorkflowPromptTurn {
	return async (invocation) => {
		options.events?.push("invoke-prompt-turn");
		await invocation.ctx.waitForIdle();
		const skillBlock = options.skillBlock;
		invocation.ctx.ui.notify(
			skillBlock === undefined ? invocation.fallbackMessage : String(invocation.successMessage),
			skillBlock === undefined ? "warning" : "info",
		);
		await invocation.host.sendUserMessage(invocation.buildPrompt(skillBlock));
	};
}

function registerPicker(
	pi: FakePi,
	options: { invokePromptTurn?: InvokeCodeWorkflowPromptTurn } = {},
): void {
	codeWorkflowsExtension(pi, {
		invokeRepoSkillPromptTurn: options.invokePromptTurn ?? fakePromptTurn(),
	});
}

describe("code workflows extension", () => {
	test("registers stable commands, descriptions, argument hint, and renderers", () => {
		const pi = new FakePi();

		registerPicker(pi);

		expect(CODE_WORKFLOWS_COMMAND_NAME).toBe("code-workflows");
		expect(GH_CI_DEBUG_COMMAND_NAME).toBe("gh-ci-debug");
		expect([...pi.commands.keys()]).toEqual(["code-workflows", "gh-ci-debug"]);
		expect(pi.commands.get("code-workflows")?.description).toBe(
			"Select a rare code workflow without starting a model turn",
		);
		expect(pi.commands.get("gh-ci-debug")).toMatchObject({
			description: "Diagnose a failing GitHub Actions run or PR check",
			argumentHint: "[run URL, PR URL/number, or branch context]",
		});
		expect(pi.renderers.has(CODE_WORKFLOWS_MESSAGE_TYPE)).toBe(true);
		expect(pi.renderers.has(IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE)).toBe(true);
	});

	test("preserves every route, alias, reference, completion, and menu status", () => {
		expect(CODE_WORKFLOW_ROUTES).toHaveLength(EXPECTED_ROUTES.length);
		for (const expected of EXPECTED_ROUTES) {
			const route = resolveWorkflowRoute(expected.route);
			expect(route).toMatchObject({
				route: expected.route,
				reference: expected.reference,
				menuVisibility: expected.menuVisibility,
			});
			expect(route?.aliases).toContain(expected.alias);
			expect(resolveWorkflowRoute(expected.alias)?.route).toBe(expected.route);
			expect(completeWorkflowRoute(expected.route)).toContainEqual({
				value: expected.route,
				label: expected.route,
			});
			expect(completeWorkflowRoute(expected.alias)).toContainEqual({
				value: expected.alias,
				label: expected.alias,
			});
		}

		expect(formatWorkflowMenu()).not.toContain("gh-ci-debug");
		for (const route of EXPECTED_ROUTES.filter(
			(candidate) => candidate.menuVisibility === "visible",
		)) {
			expect(formatWorkflowMenu()).toContain(route.route);
		}
	});

	test("acknowledges before waiting and selects a visible workflow without a model turn", async () => {
		const events: string[] = [];
		const pi = new FakePi(events);
		registerPicker(pi);
		const command = pi.commands.get("code-workflows");
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext({
			events,
			selectedLabels: ["parity-review — review Pi command changes for cross-harness parity"],
		});

		await command.handler("", ctx);

		expect(events.slice(0, 2)).toEqual([
			`message:${IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE}`,
			"wait-for-idle",
		]);
		expect(pi.sentUserMessages).toEqual([]);
		const selection = pi.messages.find(
			(message) => message.customType === CODE_WORKFLOWS_MESSAGE_TYPE,
		);
		expect(selection).toMatchObject({ display: true });
		expect(selection?.content).toContain("Selected route: `parity-review`");
		expect(selection?.content).toContain("No model turn was started.");
		expect(selection?.content).toContain("The prompt has been placed in the editor.");
		expect(ctx.editorText).toBe("Use code-workflows parity-review");
	});

	test("resolves an alias directly without opening the selector", async () => {
		const pi = new FakePi();
		registerPicker(pi);
		const command = pi.commands.get("code-workflows");
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext();

		await command.handler("cross-harness-parity", ctx);

		expect(pi.sentUserMessages).toEqual([]);
		expect(
			pi.messages.find((message) => message.customType === CODE_WORKFLOWS_MESSAGE_TYPE)?.content,
		).toContain("Selected route: `parity-review`");
		expect(ctx.editorText).toBe("Use code-workflows parity-review");
		expect(ctx.selectedLabels).toEqual([]);
	});

	test("reports the visible menu without UI", async () => {
		const pi = new FakePi();
		registerPicker(pi);
		const command = pi.commands.get("code-workflows");
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext({ hasUI: false });

		await command.handler("", ctx);

		expect(ctx.notifications).toEqual([{ message: formatWorkflowMenu(), level: "info" }]);
	});

	test("reports an unknown explicit route without changing the editor", async () => {
		const pi = new FakePi();
		registerPicker(pi);
		const command = pi.commands.get("code-workflows");
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext();

		await command.handler("not-a-route", ctx);

		expect(ctx.editorText).toBeUndefined();
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Unknown code workflow: not-a-route");
	});

	test("acknowledges before direct gh-ci-debug skill work and forwards initial context", async () => {
		const events: string[] = [];
		const pi = new FakePi(events);
		registerPicker(pi, {
			invokePromptTurn: fakePromptTurn({
				events,
				skillBlock: '<skill name="code-workflows">body</skill>',
			}),
		});
		const command = pi.commands.get("gh-ci-debug");
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext({ events });

		await command.handler("https://github.com/example/repo/actions/runs/123", ctx);

		expect(events.slice(0, 3)).toEqual([
			`message:${IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE}`,
			"invoke-prompt-turn",
			"wait-for-idle",
		]);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain('<skill name="code-workflows">body</skill>');
		expect(pi.sentUserMessages[0]).toContain("Run code-workflows gh-ci-debug");
		expect(pi.sentUserMessages[0]).toContain("https://github.com/example/repo/actions/runs/123");
	});

	test("uses the deterministic missing-skill prompt fallback", async () => {
		const pi = new FakePi();
		registerPicker(pi, { invokePromptTurn: fakePromptTurn() });
		const command = pi.commands.get("gh-ci-debug");
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext();

		await command.handler("PR 42", ctx);

		expect(pi.sentUserMessages).toEqual([buildGhCiDebugPrompt(undefined, "PR 42")]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "Could not load code-workflows backing skill; invoking gh-ci-debug by name.",
			level: "warning",
		});
	});
});

describe("gh-ci-debug prompt assembly", () => {
	test("assembles the same skill-backed and fallback prompts without filesystem I/O", () => {
		const skillBlock = '<skill name="code-workflows">body</skill>';

		expect(buildGhCiDebugPrompt(skillBlock, "PR 42")).toContain(skillBlock);
		expect(buildGhCiDebugPrompt(skillBlock, "PR 42")).toContain(
			"Run code-workflows gh-ci-debug with this initial user request:",
		);
		expect(buildGhCiDebugPrompt(undefined, "")).toBe(
			"Run code-workflows gh-ci-debug now. Follow the backing skill workflow exactly.",
		);
	});
});
