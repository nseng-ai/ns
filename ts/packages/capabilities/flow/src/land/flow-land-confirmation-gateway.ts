// Flow adapter that answers land-core confirmation requests through the Flow command UI.
//
// Adapts each LandConfirmationRequest kind to the shared confirmLandStackAction prompt with an
// exhaustive switch; command lists in details, refusals, and suggested actions come from the
// structural builders in confirmation-commands.ts.

import { postLandingCleanupCommands } from "./confirmation-commands.ts";
import type {
	LandConfirmationDecision,
	LandConfirmationGateway,
	LandConfirmationRequest,
} from "./execution/host-seams.ts";
import {
	formatFreeManagedSlotsConfirmationDetails,
	formatSingleBranchMainLandingConfirmationDetails,
	formatPlan,
	formatPostLandingCleanupConfirmationDetails,
	formatSubmitRequiredUpdatesConfirmationDetails,
	freeManagedSlotsConfirmationTitle,
	freeManagedSlotsNonInteractiveRefusalMessage,
	singleBranchMainLandingConfirmationTitle,
	singleBranchMainLandingNonInteractiveRefusalMessage,
	postLandingCleanupConfirmationTitle,
	postLandingCleanupNonInteractiveRefusalMessage,
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
				case "post-landing-cleanup":
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
	const outcome = await confirmLandStackAction(confirmationOptions(ctx, request));
	if (outcome.type === "completed") return { type: "approved", approvalSource: "prompted" };
	if (landingFailureFacts(outcome.failure).refusalReason === "declined") {
		return { type: "declined" };
	}
	return { type: "refused-with-fully-worded-failure", failure: outcome.failure };
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
		case "post-landing-cleanup":
			return postLandingCleanupOptions(ctx, request);
		default:
			assertNever(request);
	}
}

function mainLandingOptions(
	ctx: PrintAwareLandStackCommandContext,
	request: Extract<LandConfirmationRequest, { readonly kind: "main-landing" }>,
): ConfirmLandStackActionOptions {
	return {
		ctx,
		shouldPrompt: true,
		title: "Land this stack path?",
		details: formatPlan(request.plan),
		nonInteractiveMessage: `Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.\n\n${formatPlan(request.plan)}`,
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

function postLandingCleanupOptions(
	ctx: PrintAwareLandStackCommandContext,
	request: Extract<LandConfirmationRequest, { readonly kind: "post-landing-cleanup" }>,
): ConfirmLandStackActionOptions {
	return {
		ctx,
		shouldPrompt: true,
		title: postLandingCleanupConfirmationTitle(),
		details: formatPostLandingCleanupConfirmationDetails(request),
		nonInteractiveMessage: postLandingCleanupNonInteractiveRefusalMessage(request),
		nonInteractiveFailureOptions: {
			suggestedAction:
				"Pass --yes or --force to approve cleanup, or --preserve to keep the current slot and local branch.",
		},
		cancellationMessage: "Skipped post-landing cleanup by upfront choice.",
		cancellationFailureOptions: {
			level: "warning",
			outcome: "refusal",
			suggestedAction: `Run ${postLandingCleanupCommands(request).join(", then ")} when safe.`,
		},
		defaultAnswer: "yes",
	};
}

function assertNever(value: never): never {
	throw new Error(`Unhandled land confirmation request: ${JSON.stringify(value)}`);
}
