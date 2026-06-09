import { describe, expect, test } from "vitest";

import internalCodeWorkflowsExtension, {
	completeWorkflowRoute,
	formatWorkflowMenu,
	INTERNAL_CODE_WORKFLOWS_COMMAND_NAME,
	INTERNAL_CODE_WORKFLOWS_MESSAGE_TYPE,
	resolveWorkflowRoute,
} from "../src/internal-code-workflows.ts";
import type { CommandContext, CustomMessage } from "../src/handoff/runtime-types.ts";

type ExtensionAPI = Parameters<typeof internalCodeWorkflowsExtension>[0];
type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

class FakePi {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messages: CustomMessage[] = [];
	readonly renderers = new Map<string, unknown>();
	readonly sentUserMessages: string[] = [];

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(customType: string, renderer: unknown): void {
		this.renderers.set(customType, renderer);
	}

	sendMessage(message: CustomMessage): void {
		this.messages.push(message);
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}
}

class FakeCommandContext implements CommandContext {
	readonly cwd = "/repo";
	readonly hasUI: boolean;
	readonly selectedLabels: string[];
	readonly notifications: Array<{ message: string; level: "info" | "warning" | "error" | undefined }> = [];
	waitForIdleCalls = 0;

	readonly ui: CommandContext["ui"];

	constructor(options: { hasUI?: boolean; selectedLabels?: string[] } = {}) {
		this.hasUI = options.hasUI ?? true;
		this.selectedLabels = [...(options.selectedLabels ?? [])];
		this.ui = {
			notify: (message, level) => {
				this.notifications.push({ message, level });
			},
			select: async (_title, _items) => this.selectedLabels.shift(),
		};
	}

	async waitForIdle(): Promise<void> {
		this.waitForIdleCalls += 1;
	}
}

describe("internal code workflows extension", () => {
	test("registers the internal namespaced selector command", () => {
		const pi = new FakePi();

		internalCodeWorkflowsExtension(pi);

		expect([...pi.commands.keys()]).toEqual(["internal:code-workflows"]);
		expect(INTERNAL_CODE_WORKFLOWS_COMMAND_NAME).toBe("internal:code-workflows");
		expect(pi.commands.get("internal:code-workflows")?.description).toContain("without starting a model turn");
		expect(pi.renderers.has(INTERNAL_CODE_WORKFLOWS_MESSAGE_TYPE)).toBe(true);
	});

	test("selects a workflow from UI without sending a user message", async () => {
		const pi = new FakePi();
		internalCodeWorkflowsExtension(pi);
		const command = pi.commands.get("internal:code-workflows");
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext({
			selectedLabels: ["gh-ci-debug — diagnose a failing GitHub Actions run or PR check"],
		});

		await command.handler("", ctx);

		expect(ctx.waitForIdleCalls).toBe(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.messages).toHaveLength(1);
		expect(pi.messages[0]).toMatchObject({
			customType: INTERNAL_CODE_WORKFLOWS_MESSAGE_TYPE,
			display: true,
		});
		expect(pi.messages[0]?.content).toContain("Selected route: `gh-ci-debug`");
		expect(pi.messages[0]?.content).toContain("No model turn was started.");
		expect(pi.messages[0]?.content).toContain("Use internal-code-workflows gh-ci-debug");
	});

	test("resolves route argument directly without opening the selector", async () => {
		const pi = new FakePi();
		internalCodeWorkflowsExtension(pi);
		const command = pi.commands.get("internal:code-workflows");
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext();

		await command.handler("internal-pr-stack-address", ctx);

		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.messages).toHaveLength(1);
		expect(pi.messages[0]?.content).toContain("Selected route: `stack-address`");
		expect(ctx.selectedLabels).toEqual([]);
	});

	test("falls back to menu notification when UI select is unavailable", async () => {
		const pi = new FakePi();
		internalCodeWorkflowsExtension(pi);
		const command = pi.commands.get("internal:code-workflows");
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext({ hasUI: false });

		await command.handler("", ctx);

		expect(pi.messages).toEqual([]);
		expect(ctx.notifications).toEqual([{ message: formatWorkflowMenu(), level: "info" }]);
	});

	test("supports aliases and completions", () => {
		expect(resolveWorkflowRoute("ci-debug")?.route).toBe("gh-ci-debug");
		expect(resolveWorkflowRoute("internal-code-gt-delete-stack")?.route).toBe("delete-stack");
		expect(completeWorkflowRoute("stack")).toEqual([
			{ value: "stackify-branch", label: "stackify-branch" },
			{ value: "stacker-agent", label: "stacker-agent" },
			{ value: "stacker", label: "stacker" },
			{ value: "stack-address", label: "stack-address" },
		]);
	});
});
