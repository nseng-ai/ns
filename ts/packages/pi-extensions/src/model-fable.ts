const FABLE_PROVIDER = "anthropic";
const FABLE_MODEL_ID = "claude-fable-5";
const FABLE_MODEL_REF = `${FABLE_PROVIDER}/${FABLE_MODEL_ID}`;

type NotifyLevel = "info" | "warning" | "error";

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

export default function modelFableExtension(pi: ExtensionAPI): void {
	pi.registerCommand("model:fable", {
		description: `Switch to ${FABLE_MODEL_REF}`,
		handler: async (_args, ctx) => {
			const model = ctx.modelRegistry.find(FABLE_PROVIDER, FABLE_MODEL_ID);
			if (model === undefined) {
				notify(ctx, `Model ${FABLE_MODEL_REF} not found.`, "error");
				return;
			}

			const switched = await pi.setModel(model);
			if (!switched) {
				notify(ctx, `Model ${FABLE_MODEL_REF} is unavailable; run /login or configure Pi auth.`, "error");
				return;
			}

			notify(ctx, `Switched model to ${FABLE_MODEL_REF}.`, "info");
		},
	});
}

function notify(ctx: CommandContext, message: string, level: NotifyLevel): void {
	if (ctx.hasUI !== false) {
		ctx.ui.notify(message, level);
	}
}
