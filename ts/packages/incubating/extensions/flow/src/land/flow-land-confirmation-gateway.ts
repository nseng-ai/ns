// Flow adapter that answers land-core confirmation requests through the Flow command UI.
//
// Adapts each LandConfirmationRequest kind to the shared confirmLandStackAction prompt with an
// exhaustive switch; command lists in details, refusals, and suggested actions come from the
// structural builders in confirmation-commands.ts.

import type {
	LandConfirmationDecision,
	LandConfirmationGateway,
	LandConfirmationRequest,
} from "./execution/host-seams.ts";
import {
	appendPostLandingCleanupImpact,
	formatFreeManagedSlotsConfirmationDetails,
	formatSingleBranchMainLandingConfirmationDetails,
	formatPlan,
	landingCleanupChoiceLabels,
	landingCleanupChoiceTitle,
	formatSubmitRequiredUpdatesConfirmationDetails,
	freeManagedSlotsConfirmationTitle,
	freeManagedSlotsNonInteractiveRefusalMessage,
	singleBranchMainLandingConfirmationTitle,
	singleBranchMainLandingNonInteractiveRefusalMessage,
	submitRequiredUpdatesConfirmationTitle,
	submitRequiredUpdatesNonInteractiveRefusalMessage,
	submitRequiredUpdatesSuggestedAction,
} from "./land-presentation.ts";
import { landingFailureFacts } from "./results.ts";
import {
	confirmLandStackAction,
	type ConfirmLandStackActionOptions,
} from "./stack/pre-merge-confirmation.ts";
import type { PrintAwareLandStackCommandContext } from "./stack/types.ts";

export function createFlowLandConfirmationGateway(
	ctx: PrintAwareLandStackCommandContext,
): LandConfirmationGateway {
	return {
		confirm: async (request) => await confirmFlowLandAction(ctx, request),
	};
}

export function createUpfrontApprovedLandConfirmationGateway(
	base: LandConfirmationGateway,
	approvedRequestKinds: ReadonlySet<LandConfirmationRequest["kind"]>,
): LandConfirmationGateway {
	const approvedKinds = new Set(approvedRequestKinds);
	return {
		confirm: async (request) => {
			switch (request.kind) {
				case "main-landing":
				case "single-branch-main-landing":
				case "free-managed-slots":
				case "submit-required-updates":
					return approvedKinds.has(request.kind)
						? { type: "approved", approvalSource: "approved-upfront" }
						: await base.confirm(request);
				default:
					return assertNever(request);
			}
		},
	};
}

async function confirmFlowLandAction(
	ctx: PrintAwareLandStackCommandContext,
	request: LandConfirmationRequest,
): Promise<LandConfirmationDecision> {
	const cleanupSelection = await selectLandingCleanup(ctx, request);
	if (cleanupSelection !== undefined) return cleanupSelection;

	const outcome = await confirmLandStackAction(confirmationOptions(ctx, request));
	if (outcome.type === "completed") return { type: "approved", approvalSource: "prompted" };
	if (landingFailureFacts(outcome.failure).refusalReason === "declined") {
		return { type: "declined" };
	}
	return { type: "refused-with-fully-worded-failure", failure: outcome.failure };
}

async function selectLandingCleanup(
	ctx: PrintAwareLandStackCommandContext,
	request: LandConfirmationRequest,
): Promise<LandConfirmationDecision | undefined> {
	if (
		(request.kind !== "main-landing" && request.kind !== "single-branch-main-landing") ||
		request.cleanupChoice === undefined ||
		!ctx.hasUI ||
		ctx.ui.select === undefined
	) {
		return undefined;
	}

	const details =
		request.kind === "main-landing"
			? [
					formatPlan(request.plan),
					"",
					"Both choices reconcile surviving stack and fail nonzero if required reconciliation cannot complete.",
					"Keep retains landed local branches and the managed slot. Free then cleans safely cleanable landed branches and frees the slot.",
				].join("\n")
			: formatSingleBranchMainLandingConfirmationDetails(request);
	ctx.ui.notify(details, "info");
	const labels = landingCleanupChoiceLabels(request.cleanupChoice);
	const selected = await ctx.ui.select(landingCleanupChoiceTitle(request.cleanupChoice), [
		labels.keep,
		labels.free,
		labels.cancel,
	]);
	if (selected === labels.keep) {
		return { type: "approved", approvalSource: "prompted", cleanupPolicy: "preserve" };
	}
	if (selected === labels.free) {
		return { type: "approved", approvalSource: "prompted", cleanupPolicy: "free" };
	}
	return { type: "declined" };
}

function confirmationOptions(
	ctx: PrintAwareLandStackCommandContext,
	request: LandConfirmationRequest,
): ConfirmLandStackActionOptions {
	switch (request.kind) {
		case "main-landing":
			return mainLandingOptions(ctx, request);
		case "single-branch-main-landing":
			return singleBranchMainLandingOptions(ctx, request);
		case "free-managed-slots":
			return freeManagedSlotsOptions(ctx, request);
		case "submit-required-updates":
			return submitRequiredUpdatesOptions(ctx, request);
		default:
			assertNever(request);
	}
}

function mainLandingOptions(
	ctx: PrintAwareLandStackCommandContext,
	request: Extract<LandConfirmationRequest, { readonly kind: "main-landing" }>,
): ConfirmLandStackActionOptions {
	const details = appendPostLandingCleanupImpact(formatPlan(request.plan), request.cleanup);
	return {
		ctx,
		shouldPrompt: true,
		title: "Land this stack path?",
		details,
		nonInteractiveMessage: `Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.\n\n${details}`,
		defaultAnswer: "yes",
	};
}

function singleBranchMainLandingOptions(
	ctx: PrintAwareLandStackCommandContext,
	request: Extract<LandConfirmationRequest, { readonly kind: "single-branch-main-landing" }>,
): ConfirmLandStackActionOptions {
	return {
		ctx,
		shouldPrompt: true,
		title: singleBranchMainLandingConfirmationTitle(),
		details: formatSingleBranchMainLandingConfirmationDetails(request),
		nonInteractiveMessage: singleBranchMainLandingNonInteractiveRefusalMessage(request),
		defaultAnswer: "yes",
	};
}

function freeManagedSlotsOptions(
	ctx: PrintAwareLandStackCommandContext,
	request: Extract<LandConfirmationRequest, { readonly kind: "free-managed-slots" }>,
): ConfirmLandStackActionOptions {
	return {
		ctx,
		shouldPrompt: true,
		title: freeManagedSlotsConfirmationTitle(),
		details: formatFreeManagedSlotsConfirmationDetails(request),
		nonInteractiveMessage: freeManagedSlotsNonInteractiveRefusalMessage(request),
	};
}

function submitRequiredUpdatesOptions(
	ctx: PrintAwareLandStackCommandContext,
	request: Extract<LandConfirmationRequest, { readonly kind: "submit-required-updates" }>,
): ConfirmLandStackActionOptions {
	return {
		ctx,
		shouldPrompt: true,
		title: submitRequiredUpdatesConfirmationTitle(request),
		details: formatSubmitRequiredUpdatesConfirmationDetails(request),
		nonInteractiveMessage: submitRequiredUpdatesNonInteractiveRefusalMessage(request),
		nonInteractiveFailureOptions: {
			suggestedAction: submitRequiredUpdatesSuggestedAction(request),
		},
	};
}

function assertNever(value: never): never {
	throw new Error(`Unhandled land confirmation request: ${JSON.stringify(value)}`);
}
