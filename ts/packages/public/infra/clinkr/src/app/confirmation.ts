import type { ClinkrInteraction } from "../confirmation.ts";
import {
	negative,
	usageError,
	type CommandOutcome,
	type NegativeOutcome,
	type UsageErrorOutcome,
} from "./outcome.ts";

export interface ConfirmedOutcome {
	readonly status: "confirmed";
}

export type ConfirmationOutcome = ConfirmedOutcome | NegativeOutcome | UsageErrorOutcome;

export interface ConfirmationPolicyOptions<
	TDeclined extends CommandOutcome<unknown>,
	TAborted extends CommandOutcome<unknown>,
> {
	readonly message: string;
	readonly nonInteractive: {
		readonly message: string;
		readonly missingFlag: string;
		readonly howToSupply: string;
	};
	readonly onDeclined: () => TDeclined;
	readonly onAborted: () => TAborted;
}

/**
 * Gate a destructive action on an interactive yes/no confirmation.
 *
 * Non-interactive hosts get a usage error, a declined prompt is a negative
 * outcome, and an aborted prompt is a usage error; only an explicit "yes"
 * confirms.
 */
export function confirmOrUsageError(
	interaction: ClinkrInteraction,
	options: { readonly message: string },
): Promise<ConfirmationOutcome>;
export function confirmOrUsageError<
	TDeclined extends CommandOutcome<unknown>,
	TAborted extends CommandOutcome<unknown>,
>(
	interaction: ClinkrInteraction,
	options: ConfirmationPolicyOptions<TDeclined, TAborted>,
): Promise<ConfirmedOutcome | UsageErrorOutcome | TDeclined | TAborted>;
export async function confirmOrUsageError<
	TDeclined extends CommandOutcome<unknown>,
	TAborted extends CommandOutcome<unknown>,
>(
	interaction: ClinkrInteraction,
	options: { readonly message: string } | ConfirmationPolicyOptions<TDeclined, TAborted>,
): Promise<ConfirmationOutcome | TDeclined | TAborted> {
	if (!interaction.isInteractive()) {
		if (!("nonInteractive" in options)) {
			return usageError("Interactive confirmation is required.");
		}
		return usageError(options.nonInteractive.message, {
			missingFlag: options.nonInteractive.missingFlag,
			howToSupply: options.nonInteractive.howToSupply,
		});
	}
	const result = await interaction.confirm({ message: options.message, defaultAnswer: "no" });
	if (result.type === "declined") {
		return "onDeclined" in options ? options.onDeclined() : negative("Confirmation declined.");
	}
	if (result.type === "aborted") {
		return "onAborted" in options ? options.onAborted() : usageError("Confirmation was aborted.");
	}
	return { status: "confirmed" };
}
