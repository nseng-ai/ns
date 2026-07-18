import { registerCommandWithImmediateAck } from "../../commands/ack.ts";
import { notifyCommandUi, type NotifiableCommandContext } from "../../commands/helpers.ts";

export const MODEL_SHORTCUTS = [
	{ command: "model:fable", provider: "vercel-ai-gateway", modelId: "anthropic/claude-fable-5" },
	{
		command: "model:sonnet",
		provider: "vercel-ai-gateway",
		modelId: "anthropic/claude-sonnet-4-5",
	},
	{ command: "model:spud", provider: "vercel-ai-gateway", modelId: "openai/gpt-5.6-sol" },
	{ command: "model:sol", provider: "vercel-ai-gateway", modelId: "openai/gpt-5.6-sol" },
	{ command: "model:terra", provider: "vercel-ai-gateway", modelId: "openai/gpt-5.6-terra" },
	{ command: "model:luna", provider: "vercel-ai-gateway", modelId: "openai/gpt-5.6-luna" },
	{ command: "model:gpt-mini", provider: "vercel-ai-gateway", modelId: "openai/gpt-5.4-mini" },
	{
		command: "model:gemini-pro",
		provider: "vercel-ai-gateway",
		modelId: "google/gemini-3.1-pro-preview",
	},
	{
		command: "model:gemini-flash",
		provider: "vercel-ai-gateway",
		modelId: "google/gemini-3.5-flash",
	},
	{
		command: "model:haiku",
		provider: "vercel-ai-gateway",
		modelId: "anthropic/claude-haiku-4-5",
	},
	{
		command: "model:opus",
		provider: "vercel-ai-gateway",
		modelId: "anthropic/claude-opus-4-8",
	},
] as const satisfies readonly ModelShortcut[];

export interface ModelShortcut {
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

interface CommandContext extends NotifiableCommandContext {
	modelRegistry: ModelRegistry;
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
		registerCommandWithImmediateAck({
			host: pi,
			commandName: shortcut.command,
			commandDefinition: {
				description: `Switch to ${modelRef(shortcut)}`,
				handler: async (_args, ctx) => {
					await switchToModel(pi, ctx, shortcut);
				},
			},
		});
	}
}

async function switchToModel(
	pi: ExtensionAPI,
	ctx: CommandContext,
	shortcut: ModelShortcut,
): Promise<void> {
	const ref = modelRef(shortcut);
	const model = ctx.modelRegistry.find(shortcut.provider, shortcut.modelId);
	if (model === undefined) {
		notifyCommandUi(ctx, `Model ${ref} not found.`, "error");
		return;
	}

	const switched = await pi.setModel(model);
	if (!switched) {
		notifyCommandUi(ctx, `Model ${ref} is unavailable; run /login or configure Pi auth.`, "error");
		return;
	}

	notifyCommandUi(ctx, `Switched model to ${ref}.`, "info");
}

export function modelRef(shortcut: ModelShortcut): string {
	return `${shortcut.provider}/${shortcut.modelId}`;
}
