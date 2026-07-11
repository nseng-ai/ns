import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	completed,
	failure,
	landingExecutionFailure,
	type LandFlowFailure,
	type LandingExecutionFailureOptions,
	type LandStackOutcome,
} from "./errors.ts";
import type { LandingPlan } from "../types.ts";
import type { StackLandingRuntime } from "./stack-landing-runtime.ts";
import type { LandProgressReporter, LandStackCommandContext } from "./types.ts";

const LANDING_CANCELLED_MESSAGE = "Cancelled before merge; no PRs were landed.";

export type PreMergeConfirmation = "prompt" | "already-approved";

export interface PreMergeMaintenanceOptions {
	runtime: StackLandingRuntime;
	ctx: LandStackCommandContext;
	progress: LandProgressReporter;
	plan: LandingPlan;
	confirmation?: PreMergeConfirmation;
}

interface ConfirmLandStackActionOptions {
	ctx: LandStackCommandContext;
	shouldPrompt: boolean;
	title: string;
	details: string;
	nonInteractiveMessage: string;
	nonInteractiveFailureOptions?: LandingExecutionFailureOptions;
	cancellationMessage?: string;
	cancellationFailureOptions?: LandingExecutionFailureOptions;
	renderDetails?: (details: string) => string;
	defaultAnswer?: "yes" | "no";
	onFailure?: (landFailure: LandFlowFailure) => void;
}

export async function confirmLandStackAction(
	options: ConfirmLandStackActionOptions,
): Promise<LandStackOutcome> {
	if (!options.shouldPrompt) return completed();

	if (!options.ctx.hasUI) {
		const landFailure = landingExecutionFailure(options.nonInteractiveMessage, {
			...options.nonInteractiveFailureOptions,
			outcome: "refusal",
			refusalReason: "non-interactive",
		});
		options.onFailure?.(landFailure);
		return failure(landFailure);
	}

	const details = options.renderDetails?.(options.details) ?? options.details;
	const confirmOptions =
		options.defaultAnswer === undefined
			? undefined
			: optionalEntry("defaultAnswer", options.defaultAnswer);
	const confirmed = await options.ctx.ui.confirm(options.title, details, confirmOptions);
	if (confirmed) return completed();

	const cancellationFailureOptions = {
		...(options.cancellationFailureOptions ?? {
			level: "info",
			outcome: "refusal",
		}),
		refusalReason: "declined" as const,
	};
	const landFailure = landingExecutionFailure(
		options.cancellationMessage ?? LANDING_CANCELLED_MESSAGE,
		cancellationFailureOptions,
	);
	options.onFailure?.(landFailure);
	return failure(landFailure);
}

interface ConfirmPreMergeMaintenanceOptions {
	ctx: LandStackCommandContext;
	confirmation?: PreMergeConfirmation;
	title: string;
	details: string;
	nonInteractiveMessage: string;
	nonInteractiveFailureOptions?: LandingExecutionFailureOptions;
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
		...optionalEntry("nonInteractiveFailureOptions", options.nonInteractiveFailureOptions),
	});
}
