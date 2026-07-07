import {
	completed,
	failure,
	landStackFailure,
	type LandStackFailure,
	type LandStackFailureOptions,
	type LandStackOutcome,
} from "./errors.ts";
import type { LandingPlan } from "../types.ts";
import type { StackLandingRuntime } from "./stack-landing-runtime.ts";
import type { LandStackCommandContext } from "./types.ts";

const LANDING_CANCELLED_MESSAGE = "Cancelled before merge; no PRs were landed.";

export type PreMergeConfirmation = "prompt" | "already-approved";

export interface PreMergeMaintenanceOptions {
	runtime: StackLandingRuntime;
	ctx: LandStackCommandContext;
	plan: LandingPlan;
	confirmation?: PreMergeConfirmation;
}

export function optionalField<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
	return value === undefined ? {} : ({ [key]: value } as { [P in K]: V });
}

interface ConfirmLandStackActionOptions {
	ctx: LandStackCommandContext;
	shouldPrompt: boolean;
	title: string;
	details: string;
	nonInteractiveMessage: string;
	nonInteractiveFailureOptions?: LandStackFailureOptions;
	cancellationMessage?: string;
	cancellationFailureOptions?: LandStackFailureOptions;
	renderDetails?: (details: string) => string;
	defaultAnswer?: "yes" | "no";
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
			refusalReason: "non-interactive",
		});
		options.onFailure?.(landFailure);
		return failure(landFailure);
	}

	const details = options.renderDetails?.(options.details) ?? options.details;
	const confirmOptions =
		options.defaultAnswer === undefined
			? undefined
			: optionalField("defaultAnswer", options.defaultAnswer);
	const confirmed = await options.ctx.ui.confirm(options.title, details, confirmOptions);
	if (confirmed) return completed();

	const cancellationFailureOptions = {
		...(options.cancellationFailureOptions ?? {
			level: "info",
			outcome: "refusal",
		}),
		refusalReason: "declined" as const,
	};
	const landFailure = landStackFailure(
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
		...optionalField("nonInteractiveFailureOptions", options.nonInteractiveFailureOptions),
	});
}
