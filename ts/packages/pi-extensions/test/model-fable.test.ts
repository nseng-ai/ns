import { describe, expect, test } from "vitest";

import modelFableExtension from "../src/model-fable.ts";
import type { ExtensionAPI } from "../src/model-fable.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type NotifyLevel = "info" | "warning" | "error";

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

interface ModelInfo {
	provider: string;
	id: string;
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly setModels: ModelInfo[] = [];
	private readonly setModelResult: boolean;

	constructor(setModelResult = true) {
		this.setModelResult = setModelResult;
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	async setModel(model: ModelInfo): Promise<boolean> {
		this.setModels.push(model);
		return this.setModelResult;
	}
}

function commandFor(pi: FakePi, name: string): RegisteredCommand {
	const command = pi.commands.get(name);
	if (command === undefined) {
		throw new Error(`Expected command to be registered: ${name}`);
	}
	return command;
}

function createContext(options: { model?: ModelInfo; hasUI?: boolean } = {}): {
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
					if (options.model?.provider === provider && options.model.id === modelId) {
						return options.model;
					}
					return undefined;
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

describe("modelFableExtension", () => {
	test("registers the model:fable command", () => {
		const pi = new FakePi();

		modelFableExtension(pi);

		expect(pi.commands.get("model:fable")?.description).toBe("Switch to anthropic/claude-fable-5");
	});

	test("switches to Claude Fable when the model is available", async () => {
		const model = { provider: "anthropic", id: "claude-fable-5" };
		const pi = new FakePi();
		modelFableExtension(pi);
		const { ctx, notifications } = createContext({ model });

		await commandFor(pi, "model:fable").handler("", ctx);

		expect(pi.setModels).toEqual([model]);
		expect(notifications).toEqual([{ message: "Switched model to anthropic/claude-fable-5.", level: "info" }]);
	});

	test("notifies when the Fable model is missing", async () => {
		const pi = new FakePi();
		modelFableExtension(pi);
		const { ctx, notifications } = createContext();

		await commandFor(pi, "model:fable").handler("", ctx);

		expect(pi.setModels).toEqual([]);
		expect(notifications).toEqual([{ message: "Model anthropic/claude-fable-5 not found.", level: "error" }]);
	});

	test("notifies when the model cannot be selected", async () => {
		const model = { provider: "anthropic", id: "claude-fable-5" };
		const pi = new FakePi(false);
		modelFableExtension(pi);
		const { ctx, notifications } = createContext({ model });

		await commandFor(pi, "model:fable").handler("", ctx);

		expect(pi.setModels).toEqual([model]);
		expect(notifications).toEqual([
			{ message: "Model anthropic/claude-fable-5 is unavailable; run /login or configure Pi auth.", level: "error" },
		]);
	});

	test("does not notify when UI is unavailable", async () => {
		const model = { provider: "anthropic", id: "claude-fable-5" };
		const pi = new FakePi();
		modelFableExtension(pi);
		const { ctx, notifications } = createContext({ hasUI: false, model });

		await commandFor(pi, "model:fable").handler("", ctx);

		expect(pi.setModels).toEqual([model]);
		expect(notifications).toEqual([]);
	});
});
