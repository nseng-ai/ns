import { usageError, type ClinkrUsageErrorExit } from "@nseng-ai/clinkr/legacy";

export { createClinkrInteraction, resolveClinkrInteraction } from "./interaction.ts";
export type {
	ClinkrInteraction,
	ConfirmationDefault,
	ConfirmationPromptFormatter,
	ConfirmationRequest,
	ConfirmationResult,
	CreateClinkrInteractionOptions,
	ResolveClinkrInteractionOptions,
} from "./interaction.ts";
import type { ClinkrInteraction, ConfirmationRequest, ConfirmationResult } from "./interaction.ts";

export interface ConfirmInteractiveOrUsageErrorOptions {
	nonInteractive: { message: string; missingFlag: string; howToSupply: string };
	confirmation: ConfirmationRequest;
	beforePrompt?: () => void;
}

export type InteractiveConfirmationResult = ConfirmationResult | ClinkrUsageErrorExit;

export function requireInteractiveOrUsageError(
	interaction: ClinkrInteraction,
	opts: { message: string; missingFlag: string; howToSupply: string },
): ClinkrUsageErrorExit | undefined {
	return interaction.isInteractive()
		? undefined
		: usageError(opts.message, { missingFlag: opts.missingFlag, howToSupply: opts.howToSupply });
}

export async function confirmInteractiveOrUsageError(
	interaction: ClinkrInteraction,
	options: ConfirmInteractiveOrUsageErrorOptions,
): Promise<InteractiveConfirmationResult> {
	const gate = requireInteractiveOrUsageError(interaction, options.nonInteractive);
	if (gate !== undefined) return gate;
	options.beforePrompt?.();
	return interaction.confirm(options.confirmation);
}
