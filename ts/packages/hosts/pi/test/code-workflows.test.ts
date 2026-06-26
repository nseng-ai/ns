import { describe, expect, test } from "vitest";

import codeWorkflowsExtension, {
	CODE_WORKFLOWS_COMMAND_NAME,
	CODE_WORKFLOWS_MESSAGE_TYPE,
	GH_CI_DEBUG_COMMAND_NAME,
	completeWorkflowRoute,
	formatWorkflowMenu,
	resolveWorkflowRoute,
} from "../src/flow/code-workflows.ts";
import type { CommandContext, CustomMessage } from "../src/handoff/runtime-types.ts";

type ExtensionAPI = Parameters<typeof codeWorkflowsExtension>[0];
type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

class FakePi {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messages: CustomMessage[] = [];
	readonly ackMessages: CustomMessage[] = [];
	readonly renderers = new Map<string, unknown>();
	readonly sentUserMessages: string[] = [];

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(customType: string, renderer: unknown): void {
		if (customType === "sdl-command-ack") return;
		this.renderers.set(customType, renderer);
	}

	sendMessage(message: CustomMessage): void {
		if (message.customType === "sdl-command-ack") {
			this.ackMessages.push(message);
			return;
		}
		this.messages.push(message);
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
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
	editorText: string | undefined;
	waitForIdleCalls = 0;

	readonly ui: CommandContext["ui"];

	constructor(options: { cwd?: string; hasUI?: boolean; selectedLabels?: string[] } = {}) {
		this.cwd = options.cwd ?? "/repo";
		this.hasUI = options.hasUI ?? true;
		this.selectedLabels = [...(options.selectedLabels ?? [])];
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
	}
}

describe("code workflows extension", () => {
	test("registers router and direct gh-ci-debug commands", () => {
		const pi = new FakePi();

		codeWorkflowsExtension(pi);

		expect(CODE_WORKFLOWS_COMMAND_NAME).toBe("code-workflows");
		expect(GH_CI_DEBUG_COMMAND_NAME).toBe("gh-ci-debug");
		expect([...pi.commands.keys()]).toEqual(["code-workflows", "gh-ci-debug"]);
		expect(pi.commands.get("code-workflows")?.description).toContain(
			"without starting a model turn",
		);
		expect(pi.commands.get("gh-ci-debug")?.description).toContain("GitHub Actions");
		expect(pi.renderers.has(CODE_WORKFLOWS_MESSAGE_TYPE)).toBe(true);
	});

	test("selects a menu-visible workflow from UI without sending a user message", async () => {
		const pi = new FakePi();
		codeWorkflowsExtension(pi);
		const command = pi.commands.get("code-workflows");
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext({
			selectedLabels: ["parity-review — review Pi command changes for cross-harness parity"],
		});

		await command.handler("", ctx);

		expect(ctx.waitForIdleCalls).toBe(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.messages).toHaveLength(1);
		expect(pi.messages[0]).toMatchObject({
			customType: CODE_WORKFLOWS_MESSAGE_TYPE,
			display: true,
		});
		expect(pi.messages[0]?.content).toContain("Selected route: `parity-review`");
		expect(pi.messages[0]?.content).toContain("No model turn was started.");
		expect(pi.messages[0]?.content).toContain("The prompt has been placed in the editor.");
		expect(pi.messages[0]?.content).toContain("Use code-workflows parity-review");
		expect(ctx.editorText).toBe("Use code-workflows parity-review");
	});

	test("resolves route argument directly without opening the selector", async () => {
		const pi = new FakePi();
		codeWorkflowsExtension(pi);
		const command = pi.commands.get("code-workflows");
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext();

		await command.handler("cross-harness-parity", ctx);

		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.messages).toHaveLength(1);
		expect(pi.messages[0]?.content).toContain("Selected route: `parity-review`");
		expect(ctx.editorText).toBe("Use code-workflows parity-review");
		expect(ctx.selectedLabels).toEqual([]);
	});

	test("top-level gh-ci-debug command starts the route with initial context", async () => {
		const pi = new FakePi();
		codeWorkflowsExtension(pi);
		const command = pi.commands.get("gh-ci-debug");
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext({ cwd: process.cwd() });

		await command.handler("https://app.graphite.com/github/pr/dagster-io/sdl-tools/1964", ctx);

		expect(pi.messages).toEqual([]);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain('<skill name="code-workflows"');
		expect(pi.sentUserMessages[0]).toContain("Run code-workflows gh-ci-debug");
		expect(pi.sentUserMessages[0]).toContain(
			"https://app.graphite.com/github/pr/dagster-io/sdl-tools/1964",
		);
		expect(ctx.notifications).toEqual([{ message: "Invoking gh-ci-debug.", level: "info" }]);
		expect(ctx.waitForIdleCalls).toBe(1);
	});

	test("falls back to menu notification without explicit-only gh-ci-debug route", async () => {
		const pi = new FakePi();
		codeWorkflowsExtension(pi);
		const command = pi.commands.get("code-workflows");
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext({ hasUI: false });

		await command.handler("", ctx);

		expect(pi.messages).toEqual([]);
		expect(formatWorkflowMenu()).not.toContain("gh-ci-debug");
		expect(formatWorkflowMenu()).toContain("parity-review");
		expect(ctx.notifications).toEqual([{ message: formatWorkflowMenu(), level: "info" }]);
	});

	test("supports aliases and completions", () => {
		expect(resolveWorkflowRoute("ci-debug")?.route).toBe("gh-ci-debug");
		expect(resolveWorkflowRoute("gt-delete-stack")?.route).toBe("delete-stack");
		expect(completeWorkflowRoute("stack")).toEqual([
			{ value: "stackify-branch", label: "stackify-branch" },
			{ value: "stacker-agent", label: "stacker-agent" },
			{ value: "stacker", label: "stacker" },
		]);
	});
});
