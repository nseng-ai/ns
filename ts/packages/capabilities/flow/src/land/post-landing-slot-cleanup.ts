import type {
	LandConfirmationDecision,
	LandConfirmationGateway,
	LandConfirmationRequest,
	LandExecutionProgress,
} from "./execution/host-seams.ts";
import {
	planManagedSlotPostLandingCleanup,
	resolveManagedSlotPostLandingCleanupDecision,
	runManagedSlotPostLandingCleanup,
	type PostLandingCleanupOptions,
	type PostLandingSlotCleanupDecision,
	type PostLandingSlotCleanupPreview,
} from "./execution/post-landing-cleanup.ts";
import {
	formatFreeManagedSlotsConfirmationDetails,
	formatPlan,
	formatPostLandingCleanupConfirmationDetails,
	formatSubmitRequiredUpdatesConfirmationDetails,
	freeManagedSlotsConfirmationTitle,
	freeManagedSlotsNonInteractiveRefusalMessage,
	notifyPrintAware,
	postLandingCleanupConfirmationTitle,
	postLandingCleanupNonInteractiveRefusalMessage,
	presentFailureAndReturn,
	setStatus,
	submitRequiredUpdatesConfirmationTitle,
	submitRequiredUpdatesNonInteractiveRefusalMessage,
	submitRequiredUpdatesSuggestedAction,
} from "./land-presentation.ts";
import {
	confirmLandStackAction,
	type PreMergeConfirmation,
} from "./stack/pre-merge-confirmation.ts";
import {
	landCompleted,
	landingFailureFacts,
	landOutcomeFailure,
	type LandOutcome,
	type LandResult,
} from "./results.ts";
import type { PrintAwareLandStackCommandContext, ParsedArgs } from "./stack/types.ts";
import type { LandContext, LandingShape } from "./types.ts";

export type { PostLandingSlotCleanupDecision, PostLandingSlotCleanupPreview };

interface ResolvePostLandingSlotCleanupDecisionOptions {
	readonly ctx: PrintAwareLandStackCommandContext;
	readonly args: ParsedArgs;
	readonly shape: LandingShape;
	readonly confirmation?: PreMergeConfirmation;
}

interface RunPostLandingSlotCleanupOptions {
	readonly landContext: LandContext;
	readonly ctx: PrintAwareLandStackCommandContext;
	readonly args: ParsedArgs;
	readonly shape: LandingShape;
	readonly cleanupDecision: PostLandingSlotCleanupDecision;
}

export function planPostLandingSlotCleanup(options: {
	readonly args: ParsedArgs;
	readonly shape: LandingShape;
}): PostLandingSlotCleanupPreview | undefined {
	return planManagedSlotPostLandingCleanup({
		cleanup: cleanupOptions(options.args),
		shape: options.shape,
	});
}

export async function resolvePostLandingSlotCleanupDecision(
	options: ResolvePostLandingSlotCleanupDecisionOptions,
): Promise<LandResult<PostLandingSlotCleanupDecision>> {
	const result = await resolveManagedSlotPostLandingCleanupDecision({
		confirmation: createFlowLandConfirmationGateway(options.ctx),
		confirmationAlreadyApproved: options.confirmation === "already-approved",
		cleanup: cleanupOptions(options.args),
		shape: options.shape,
	});
	if (result.type === "failure") return presentFailureAndReturn(options.ctx, result.failure);
	return result;
}

export async function runPostLandingSlotCleanup(
	options: RunPostLandingSlotCleanupOptions,
): Promise<LandOutcome> {
	const result = await runManagedSlotPostLandingCleanup({
		landContext: options.landContext,
		progress: cleanupProgress(options.ctx),
		cleanup: cleanupOptions(options.args),
		shape: options.shape,
		cleanupDecision: options.cleanupDecision,
	});
	if (result.type === "failure") {
		presentFailureAndReturn(options.ctx, result.failure);
		return landOutcomeFailure(result.failure);
	}
	if (result.successMessage !== undefined) {
		notifyPrintAware({
			ctx: options.ctx,
			message: result.successMessage,
			level: "success",
			kind: "success",
		});
	}
	return landCompleted();
}

export function createFlowLandConfirmationGateway(
	ctx: PrintAwareLandStackCommandContext,
): LandConfirmationGateway {
	return {
		confirm: async (request) => await confirmFlowLandAction(ctx, request),
	};
}

async function confirmFlowLandAction(
	ctx: PrintAwareLandStackCommandContext,
	request: LandConfirmationRequest,
): Promise<LandConfirmationDecision> {
	const outcome = await confirmLandStackAction(
		request.kind === "main-landing"
			? {
					ctx,
					shouldPrompt: true,
					title: "Land this stack path?",
					details: formatPlan(request.plan),
					nonInteractiveMessage: `Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.\n\n${formatPlan(request.plan)}`,
				}
			: request.kind === "post-landing-cleanup"
				? {
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
							suggestedAction: cleanupSuggestedAction(request),
						},
						defaultAnswer: "yes",
					}
				: request.kind === "free-managed-slots"
					? {
							ctx,
							shouldPrompt: true,
							title: freeManagedSlotsConfirmationTitle(),
							details: formatFreeManagedSlotsConfirmationDetails(request),
							nonInteractiveMessage: freeManagedSlotsNonInteractiveRefusalMessage(request),
						}
					: {
							ctx,
							shouldPrompt: true,
							title: submitRequiredUpdatesConfirmationTitle(request),
							details: formatSubmitRequiredUpdatesConfirmationDetails(request),
							nonInteractiveMessage: submitRequiredUpdatesNonInteractiveRefusalMessage(request),
							nonInteractiveFailureOptions: {
								suggestedAction: submitRequiredUpdatesSuggestedAction(request),
							},
						},
	);
	if (outcome.type === "completed") return { type: "approved" };
	if (landingFailureFacts(outcome.failure).refusalReason === "declined") {
		return { type: "declined" };
	}
	return { type: "refused-with-fully-worded-failure", failure: outcome.failure };
}

function cleanupOptions(args: ParsedArgs): PostLandingCleanupOptions {
	return {
		isDryRun: args.isDryRun,
		shouldPreserveSlot: args.shouldPreserveSlot,
		shouldSkipConfirmation: args.shouldSkipConfirmation,
		shouldForceCleanup: args.shouldForceCleanup,
	};
}

function cleanupProgress(ctx: PrintAwareLandStackCommandContext): LandExecutionProgress {
	return {
		note() {},
		setStatus: (message) => setStatus(ctx, message),
		setStep() {},
		recordMergedPullRequest() {},
		planRecalculated() {},
	};
}

function cleanupSuggestedAction(
	request: Extract<LandConfirmationRequest, { readonly kind: "post-landing-cleanup" }>,
): string {
	const details = formatPostLandingCleanupConfirmationDetails(request);
	const commands = details
		.split("\n")
		.filter((line) => line.startsWith("$ "))
		.map((line) => line.slice(2));
	return `Run ${commands.join(", then ")} when safe.`;
}
