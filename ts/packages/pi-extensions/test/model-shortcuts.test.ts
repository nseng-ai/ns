import { describe, expect, test } from "vitest";

import modelShortcutExtension from "../src/model-shortcuts.ts";
import type { ExtensionAPI } from "../src/model-shortcuts.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type NotifyLevel = "info" | "warning" | "error";

interface ExpectedShortcut {
	command: string;
	provider: string;
	modelId: string;
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
	{ command: "model:fable", provider: "anthropic", modelId: "claude-fable-5" },
	{ command: "model:spud", provider: "openai-codex", modelId: "gpt-5.5" },
	{ command: "model:gpt-mini", provider: "openai-codex", modelId: "gpt-5.4-mini" },
	{ command: "model:gemini-pro", provider: "google", modelId: "gemini-3.1-pro-preview" },
	{ command: "model:gemini-flash", provider: "google", modelId: "gemini-3.5-flash" },
	{ command: "model:haiku", provider: "anthropic", modelId: "claude-haiku-4-5" },
	{ command: "model:opus", provider: "anthropic", modelId: "claude-opus-4-8" },
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
	return { provider: shortcut.provider, id: shortcut.modelId };
}

function modelRef(shortcut: ExpectedShortcut): string {
	return `${shortcut.provider}/${shortcut.modelId}`;
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

	test.each(EXPECTED_SHORTCUTS)("switches $command to $provider/$modelId", async (shortcut) => {
		const pi = new FakePi();
		modelShortcutExtension(pi);
		const model = modelFromShortcut(shortcut);
		const { ctx, notifications } = createContext({ models: [model] });

		await commandFor(pi, shortcut.command).handler("", ctx);

		expect(pi.setModels).toEqual([model]);
		expect(notifications).toEqual([
			{ message: `Switched model to ${modelRef(shortcut)}.`, level: "info" },
		]);
	});

	test("notifies when a shortcut model is missing", async () => {
		const pi = new FakePi();
		modelShortcutExtension(pi);
		const { ctx, notifications } = createContext();

		await commandFor(pi, "model:spud").handler("", ctx);

		expect(pi.setModels).toEqual([]);
		expect(notifications).toEqual([
			{ message: "Model openai-codex/gpt-5.5 not found.", level: "error" },
		]);
	});

	test("notifies when a shortcut model cannot be selected", async () => {
		const model = { provider: "anthropic", id: "claude-opus-4-8" };
		const pi = new FakePi(false);
		modelShortcutExtension(pi);
		const { ctx, notifications } = createContext({ models: [model] });

		await commandFor(pi, "model:opus").handler("", ctx);

		expect(pi.setModels).toEqual([model]);
		expect(notifications).toEqual([
			{
				message: "Model anthropic/claude-opus-4-8 is unavailable; run /login or configure Pi auth.",
				level: "error",
			},
		]);
	});

	test("does not notify when UI is unavailable", async () => {
		const model = { provider: "anthropic", id: "claude-haiku-4-5" };
		const pi = new FakePi();
		modelShortcutExtension(pi);
		const { ctx, notifications } = createContext({ hasUI: false, models: [model] });

		await commandFor(pi, "model:haiku").handler("", ctx);

		expect(pi.setModels).toEqual([model]);
		expect(notifications).toEqual([]);
	});
});
