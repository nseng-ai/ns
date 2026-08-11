import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { NsCommandCompletionProvider, NsExtensionApi } from "@nseng-ai/sdk";

import { createRealSlotContext, type SlotCliContext } from "../core/context.ts";
import type { CheckoutBranchesCompletionProvider } from "./checkout-completion.ts";

interface SlotCommandContextOverrides {
	readonly context: SlotCliContext;
}

/** Route-neutral adaptation from the ns host API to the Slot command context. */
export async function createSlotCliContext(ctx: NsExtensionApi): Promise<SlotCliContext> {
	const shouldWriteCdDirective = ctx.outputFormat === undefined || ctx.outputFormat === "human";
	const overrides = readSlotCommandContextOverrides(ctx);
	if (overrides !== undefined) return { ...overrides.context, shouldWriteCdDirective };
	return await createRealSlotContext({
		cwd: ctx.cwd,
		env: ctx.env,
		...optionalEntry("stderr", ctx.stderr),
		renderCapabilities: ctx.renderCapabilities,
		...optionalEntry("extensions", ctx.extensions),
		shouldWriteCdDirective,
	});
}

/** Adapt a legacy Slot completion provider to the modern SDK candidate contract. */
export function adaptSlotCompletionProvider(
	provider: CheckoutBranchesCompletionProvider<NsExtensionApi> | undefined,
): NsCommandCompletionProvider | undefined {
	if (provider === undefined) return undefined;
	return async (ctx, request) => (await provider(ctx, request)).candidates;
}

function readSlotCommandContextOverrides(
	ctx: NsExtensionApi,
): SlotCommandContextOverrides | undefined {
	const value = ctx.extensions?.slotCommandContext;
	if (typeof value !== "object" || value === null || !("context" in value)) return undefined;
	return value as SlotCommandContextOverrides;
}
