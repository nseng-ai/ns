import { describe, expect, test } from "vitest";

import modelShortcutExtension from "../src/core/model-shortcuts/extension.ts";
import type { ExtensionAPI } from "../src/core/model-shortcuts/extension.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type NotifyLevel = "info" | "warning" | "error";

interface ExpectedShortcut {
	command: string;
	selection: { provider: string; modelId: string };
}

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

interface ModelInfo {
	provider: string;
	id: string;
}

const EXPECTED_SHORTCUTS: readonly ExpectedShortcut[] = [
	{
		command: "model:fable",
		selection: { provider: "vercel-ai-gateway", modelId: "anthropic/claude-fable-5" },
	},
	{
		command: "model:sonnet",
		selection: { provider: "vercel-ai-gateway", modelId: "anthropic/claude-sonnet-4-5" },
	},
	{
		command: "model:spud",
		selection: { provider: "vercel-ai-gateway", modelId: "openai/gpt-5.6-sol" },
	},
	{
		command: "model:sol",
		selection: { provider: "vercel-ai-gateway", modelId: "openai/gpt-5.6-sol" },
	},
	{
		command: "model:terra",
		selection: { provider: "vercel-ai-gateway", modelId: "openai/gpt-5.6-terra" },
	},
	{
		command: "model:luna",
		selection: { provider: "vercel-ai-gateway", modelId: "openai/gpt-5.6-luna" },
	},
	{
		command: "model:gpt-mini",
		selection: { provider: "vercel-ai-gateway", modelId: "openai/gpt-5.4-mini" },
	},
	{
		command: "model:gemini-pro",
		selection: { provider: "vercel-ai-gateway", modelId: "google/gemini-3.1-pro-preview" },
	},
	{
		command: "model:gemini-flash",
		selection: { provider: "vercel-ai-gateway", modelId: "google/gemini-3.5-flash" },
	},
	{
		command: "model:haiku",
		selection: { provider: "vercel-ai-gateway", modelId: "anthropic/claude-haiku-4-5" },
	},
	{
		command: "model:opus",
		selection: { provider: "vercel-ai-gateway", modelId: "anthropic/claude-opus-4-8" },
	},
];

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly setModels: ModelInfo[] = [];
	private readonly shouldSetModelSucceed: boolean;

	constructor(shouldSetModelSucceed = true) {
		this.shouldSetModelSucceed = shouldSetModelSucceed;
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	getThinkingLevel(): "high" {
		return "high";
	}

	async setModel(model: ModelInfo): Promise<boolean> {
		this.setModels.push(model);
		return this.shouldSetModelSucceed;
	}
}

function commandFor(pi: FakePi, name: string): RegisteredCommand {
	const command = pi.commands.get(name);
	if (command === undefined) {
		throw new Error(`Expected command to be registered: ${name}`);
	}
	return command;
}

function modelFromShortcut(shortcut: ExpectedShortcut): ModelInfo {
	return { provider: shortcut.selection.provider, id: shortcut.selection.modelId };
}

function modelRef(shortcut: ExpectedShortcut): string {
	return `${shortcut.selection.provider}/${shortcut.selection.modelId}`;
}

function createContext(options: { models?: readonly ModelInfo[]; hasUI?: boolean } = {}): {
	ctx: Parameters<RegisteredCommand["handler"]>[1];
	notifications: Notification[];
} {
	const notifications: Notification[] = [];
	return {
		notifications,
		ctx: {
			hasUI: options.hasUI ?? true,
			modelRegistry: {
				find(provider, modelId) {
					return options.models?.find(
						(model) => model.provider === provider && model.id === modelId,
					);
				},
			},
			ui: {
				notify(message, level) {
					notifications.push({ message, level });
				},
			},
		},
	};
}

describe("modelShortcutExtension", () => {
	test("registers direct model shortcut commands", () => {
		const pi = new FakePi();

		modelShortcutExtension(pi);

		expect(
			[...pi.commands.entries()].map(([name, command]) => [name, command.description]),
		).toEqual(
			EXPECTED_SHORTCUTS.map((shortcut) => [shortcut.command, `Switch to ${modelRef(shortcut)}`]),
		);
	});

	test.each(EXPECTED_SHORTCUTS)(
		"switches $command identity while retaining current thinking",
		async (shortcut) => {
			const pi = new FakePi();
			modelShortcutExtension(pi);
			const model = modelFromShortcut(shortcut);
			const { ctx, notifications } = createContext({ models: [model] });

			await commandFor(pi, shortcut.command).handler("", ctx);

			expect(pi.setModels).toEqual([model]);
			expect(notifications).toEqual([
				{ message: `Switched model to ${modelRef(shortcut)}.`, level: "info" },
			]);
		},
	);

	test("notifies when a shortcut model is missing", async () => {
		const pi = new FakePi();
		modelShortcutExtension(pi);
		const { ctx, notifications } = createContext();

		await commandFor(pi, "model:spud").handler("", ctx);

		expect(pi.setModels).toEqual([]);
		expect(notifications).toEqual([
			{ message: "Model vercel-ai-gateway/openai/gpt-5.6-sol not found.", level: "error" },
		]);
	});

	test("notifies when a shortcut model cannot be selected", async () => {
		const model = { provider: "vercel-ai-gateway", id: "anthropic/claude-opus-4-8" };
		const pi = new FakePi(false);
		modelShortcutExtension(pi);
		const { ctx, notifications } = createContext({ models: [model] });

		await commandFor(pi, "model:opus").handler("", ctx);

		expect(pi.setModels).toEqual([model]);
		expect(notifications).toEqual([
			{
				message:
					"Model vercel-ai-gateway/anthropic/claude-opus-4-8 is unavailable; run /login or configure Pi auth.",
				level: "error",
			},
		]);
	});

	test("does not emit a generic ack on a rendered-message host", async () => {
		// Regression: on a rendered-message host (the real Pi host), the immediate ack
		// used to append or set a generic command-running indicator. Model switches already
		// emit their own completion notification, so they should not use the transcript or
		// footer for a redundant ack.
		const sentMessages: unknown[] = [];
		const statusUpdates: { key: string; value: string | undefined }[] = [];
		const model = { provider: "vercel-ai-gateway", id: "anthropic/claude-opus-4-8" };
		const pi = new FakePi();
		// Make the host look like a rendered-message host, the condition that previously
		// forced "message" delivery.
		Object.assign(pi, {
			registerMessageRenderer(): void {},
			sendMessage(message: unknown): void {
				sentMessages.push(message);
			},
		});
		modelShortcutExtension(pi);

		const { ctx } = createContext({ models: [model] });
		const statusCtx = {
			...ctx,
			ui: {
				...ctx.ui,
				setStatus(key: string, value: string | undefined): void {
					statusUpdates.push({ key, value });
				},
			},
		};

		await commandFor(pi, "model:opus").handler("", statusCtx);

		expect(sentMessages).toEqual([]);
		expect(statusUpdates).toEqual([]);
	});

	test("does not notify when UI is unavailable", async () => {
		const model = { provider: "vercel-ai-gateway", id: "anthropic/claude-haiku-4-5" };
		const pi = new FakePi();
		modelShortcutExtension(pi);
		const { ctx, notifications } = createContext({ hasUI: false, models: [model] });

		await commandFor(pi, "model:haiku").handler("", ctx);

		expect(pi.setModels).toEqual([model]);
		expect(notifications).toEqual([]);
	});
});
