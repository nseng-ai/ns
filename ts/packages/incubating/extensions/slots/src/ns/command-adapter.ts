import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { CommandExit, NsCommandCompletionProvider, NsExtensionApi } from "@nseng-ai/sdk";

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

/** Temporary phase-1 bridge from legacy Slot exits to modern SDK outcomes. */
export function toModernSlotOutcome<T>(
	value: unknown,
	options: { readonly useHumanOverride?: boolean } = {},
): CommandExit<T> {
	if (typeof value !== "object" || value === null || !("type" in value)) {
		throw new Error("Slot command returned an invalid outcome.");
	}
	const legacy = value as Record<string, unknown>;
	if (legacy.type === "ok") return { status: "success", data: legacy.data as T };
	if (legacy.type === "negative") {
		const message =
			options.useHumanOverride === true && typeof legacy.human === "string"
				? legacy.human
				: String(legacy.message);
		return {
			status: "negative",
			message,
			...optionalEntry("data", legacy.data),
		};
	}
	if (legacy.type === "failure") {
		return {
			status: "failure",
			errorType: String(legacy.errorType),
			message: String(legacy.message),
			...optionalEntry("data", legacy.data),
		};
	}
	return {
		status: "usage-error",
		errorType: "usage-error",
		message: String(legacy.message),
		...optionalEntry("data", legacy.data),
	};
}

function readSlotCommandContextOverrides(
	ctx: NsExtensionApi,
): SlotCommandContextOverrides | undefined {
	const value = ctx.extensions?.slotCommandContext;
	if (typeof value !== "object" || value === null || !("context" in value)) return undefined;
	return value as SlotCommandContextOverrides;
}
