import {
	formatModelRef,
	type ModelSelection,
	type ModelThinking,
} from "@nseng-ai/foundation/model-slug";
import { registerCommandWithImmediateAck } from "../../commands/ack.ts";
import { notifyCommandUi, type NotifiableCommandContext } from "../../commands/helpers.ts";
import type { SendUserMessageOptions } from "../../runtime/extension-types.ts";

export const MODEL_SHORTCUTS = [
	{
		command: "model:fable",
		selection: { provider: "vercel-ai-gateway", modelId: "anthropic/claude-fable-5" },
	},
	{
		command: "model:sonnet",
		selection: {
			provider: "vercel-ai-gateway",
			modelId: "anthropic/claude-sonnet-4-5",
		},
	},
	{
		command: "model:spud",
		selection: { provider: "vercel-ai-gateway", modelId: "openai/gpt-5.6-sol" },
	},
	{
		command: "model:sol",
		selection: { provider: "vercel-ai-gateway", modelId: "openai/gpt-5.6-sol-fast" },
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
		selection: {
			provider: "vercel-ai-gateway",
			modelId: "google/gemini-3.1-pro-preview",
		},
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
] as const satisfies readonly ModelShortcut[];

export interface ModelShortcut {
	command: string;
	selection: Pick<ModelSelection, "provider" | "modelId">;
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
	isIdle(): boolean;
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
	getThinkingLevel(): ModelThinking;
	sendUserMessage(content: string, options?: SendUserMessageOptions): Promise<void> | void;
}

export default function modelShortcutExtension(pi: ExtensionAPI): void {
	for (const shortcut of MODEL_SHORTCUTS) {
		registerCommandWithImmediateAck({
			host: pi,
			commandName: shortcut.command,
			commandDefinition: {
				description: `Switch to ${modelRef(shortcut)} and optionally run a prompt`,
				handler: async (args, ctx) => {
					const switched = await switchToModel(pi, ctx, shortcut);
					if (!switched) {
						if (args.trim() !== "") {
							notifyCommandUi(ctx, `Prompt was not submitted:\n${args}`, "warning");
						}
						return;
					}
					if (args.trim() === "") return;

					if (ctx.isIdle()) {
						await pi.sendUserMessage(args);
					} else {
						await pi.sendUserMessage(args, { deliverAs: "steer" });
					}
				},
			},
			// Switching and the injected prompt already provide visible completion.
			options: { delivery: "none" },
		});
	}
}

async function switchToModel(
	pi: ExtensionAPI,
	ctx: CommandContext,
	shortcut: ModelShortcut,
): Promise<boolean> {
	const selection: ModelSelection = {
		...shortcut.selection,
		thinking: pi.getThinkingLevel(),
	};
	const ref = formatModelRef(selection);
	const model = ctx.modelRegistry.find(selection.provider, selection.modelId);
	if (model === undefined) {
		notifyCommandUi(ctx, `Model ${ref} not found.`, "error");
		return false;
	}

	const switched = await pi.setModel(model);
	if (!switched) {
		notifyCommandUi(ctx, `Model ${ref} is unavailable; run /login or configure Pi auth.`, "error");
		return false;
	}

	notifyCommandUi(ctx, `Switched model to ${ref}.`, "info");
	return true;
}

export function modelRef(shortcut: ModelShortcut): string {
	return `${shortcut.selection.provider}/${shortcut.selection.modelId}`;
}
