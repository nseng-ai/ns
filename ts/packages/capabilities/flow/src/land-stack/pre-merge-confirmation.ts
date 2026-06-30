import {
	completed,
	failure,
	landStackFailure,
	type LandStackFailureOptions,
	type LandStackOutcome,
} from "./errors.ts";
import type { LandStackCommandContext, LandStackExtensionAPI, LandingPlan } from "./types.ts";

export type PreMergeConfirmation = "prompt" | "already-approved";

export interface PreMergeMaintenanceOptions {
	pi: LandStackExtensionAPI;
	ctx: LandStackCommandContext;
	plan: LandingPlan;
	confirmation?: PreMergeConfirmation;
}

interface ConfirmPreMergeMaintenanceOptions {
	ctx: LandStackCommandContext;
	confirmation?: PreMergeConfirmation;
	title: string;
	details: string;
	nonInteractiveMessage: string;
	nonInteractiveFailureOptions?: LandStackFailureOptions;
}

export async function confirmPreMergeMaintenance(
	options: ConfirmPreMergeMaintenanceOptions,
): Promise<LandStackOutcome> {
	const confirmation = options.confirmation ?? "prompt";
	if (confirmation !== "prompt") return completed();

	if (!options.ctx.hasUI) {
		return failure(
			landStackFailure(options.nonInteractiveMessage, {
				...options.nonInteractiveFailureOptions,
				outcome: "refusal",
			}),
		);
	}

	const confirmed = await options.ctx.ui.confirm(options.title, options.details);
	if (confirmed) return completed();

	return failure(
		landStackFailure("Cancelled before merge; no PRs were landed.", {
			level: "info",
			outcome: "refusal",
		}),
	);
}
