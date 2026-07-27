import type { ClinkrInteraction } from "../confirmation.ts";
import { negative, usageError, type NegativeOutcome, type UsageErrorOutcome } from "./outcome.ts";

export type ConfirmationOutcome =
	| { readonly status: "confirmed" }
	| NegativeOutcome
	| UsageErrorOutcome;

/**
 * Gate a destructive action on an interactive yes/no confirmation.
 *
 * Non-interactive hosts get a usage error, a declined prompt is a negative
 * outcome, and an aborted prompt is a usage error; only an explicit "yes"
 * confirms.
 */
export async function confirmOrUsageError(
	interaction: ClinkrInteraction,
	options: { readonly message: string },
): Promise<ConfirmationOutcome> {
	if (!interaction.isInteractive()) return usageError("Interactive confirmation is required.");
	const result = await interaction.confirm({ message: options.message, defaultAnswer: "no" });
	if (result.type === "declined") return negative("Confirmation declined.");
	if (result.type === "aborted") return usageError("Confirmation was aborted.");
	return { status: "confirmed" };
}
