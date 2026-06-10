const MODEL_SHORTCUTS = [
	{ command: "model:fable", provider: "anthropic", modelId: "claude-fable-5" },
	{ command: "model:spud", provider: "openai-codex", modelId: "gpt-5.5" },
	{ command: "model:gpt-mini", provider: "openai-codex", modelId: "gpt-5.4-mini" },
	{ command: "model:haiku", provider: "anthropic", modelId: "claude-haiku-4-5" },
	{ command: "model:opus", provider: "anthropic", modelId: "claude-opus-4-8" },
] as const satisfies readonly ModelShortcut[];

type NotifyLevel = "info" | "warning" | "error";

interface ModelShortcut {
	command: string;
	provider: string;
	modelId: string;
}

interface ModelInfo {
	provider: string;
	id: string;
}

interface ModelRegistry {
	find(provider: string, modelId: string): ModelInfo | undefined;
}

interface CommandContext {
	hasUI?: boolean;
	modelRegistry: ModelRegistry;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
	};
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	setModel(model: ModelInfo): Promise<boolean>;
}

export default function modelShortcutExtension(pi: ExtensionAPI): void {
	for (const shortcut of MODEL_SHORTCUTS) {
		pi.registerCommand(shortcut.command, {
			description: `Switch to ${modelRef(shortcut)}`,
			handler: async (_args, ctx) => {
				await switchToModel(pi, ctx, shortcut);
			},
		});
	}
}

async function switchToModel(pi: ExtensionAPI, ctx: CommandContext, shortcut: ModelShortcut): Promise<void> {
	const ref = modelRef(shortcut);
	const model = ctx.modelRegistry.find(shortcut.provider, shortcut.modelId);
	if (model === undefined) {
		notify(ctx, `Model ${ref} not found.`, "error");
		return;
	}

	const switched = await pi.setModel(model);
	if (!switched) {
		notify(ctx, `Model ${ref} is unavailable; run /login or configure Pi auth.`, "error");
		return;
	}

	notify(ctx, `Switched model to ${ref}.`, "info");
}

function modelRef(shortcut: ModelShortcut): string {
	return `${shortcut.provider}/${shortcut.modelId}`;
}

function notify(ctx: CommandContext, message: string, level: NotifyLevel): void {
	if (ctx.hasUI !== false) {
		ctx.ui.notify(message, level);
	}
}
