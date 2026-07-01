import {
	completed,
	failure,
	landStackFailure,
	type LandStackFailure,
	type LandStackFailureOptions,
	type LandStackOutcome,
} from "./errors.ts";
import type { LandStackCommandContext, LandStackExtensionAPI, LandingPlan } from "./types.ts";

const LANDING_CANCELLED_MESSAGE = "Cancelled before merge; no PRs were landed.";

export type PreMergeConfirmation = "prompt" | "already-approved";

export interface PreMergeMaintenanceOptions {
	pi: LandStackExtensionAPI;
	ctx: LandStackCommandContext;
	plan: LandingPlan;
	confirmation?: PreMergeConfirmation;
}

export function preMergeConfirmationOption(confirmation: PreMergeConfirmation | undefined): {
	confirmation?: PreMergeConfirmation;
} {
	return confirmation === undefined ? {} : { confirmation };
}

interface ConfirmLandStackActionOptions {
	ctx: LandStackCommandContext;
	shouldPrompt: boolean;
	title: string;
	details: string;
	nonInteractiveMessage: string;
	nonInteractiveFailureOptions?: LandStackFailureOptions;
	renderDetails?: (details: string) => string;
	onFailure?: (landFailure: LandStackFailure) => void;
}

export async function confirmLandStackAction(
	options: ConfirmLandStackActionOptions,
): Promise<LandStackOutcome> {
	if (!options.shouldPrompt) return completed();

	if (!options.ctx.hasUI) {
		const landFailure = landStackFailure(options.nonInteractiveMessage, {
			...options.nonInteractiveFailureOptions,
			outcome: "refusal",
		});
		options.onFailure?.(landFailure);
		return failure(landFailure);
	}

	const details = options.renderDetails?.(options.details) ?? options.details;
	const confirmed = await options.ctx.ui.confirm(options.title, details);
	if (confirmed) return completed();

	const landFailure = landStackFailure(LANDING_CANCELLED_MESSAGE, {
		level: "info",
		outcome: "refusal",
	});
	options.onFailure?.(landFailure);
	return failure(landFailure);
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
	return await confirmLandStackAction({
		ctx: options.ctx,
		shouldPrompt: (options.confirmation ?? "prompt") === "prompt",
		title: options.title,
		details: options.details,
		nonInteractiveMessage: options.nonInteractiveMessage,
		...(options.nonInteractiveFailureOptions === undefined
			? {}
			: { nonInteractiveFailureOptions: options.nonInteractiveFailureOptions }),
	});
}
