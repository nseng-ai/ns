import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { executeStackLanding } from "./land-stack.ts";
import type { FlowLandObservabilityChannels } from "./stack/command-stream.ts";
import type { StackLandingRuntime } from "./stack/stack-landing-runtime.ts";
import { landOutcomeFailure, type LandOutcome } from "./results.ts";
import {
	presentFailureAndReturn,
	renderPlainLandConfirmationDetails,
} from "./land-presentation.ts";
import type {
	LandConfirmationPreview,
	ParsedArgs,
	PrintAwareLandStackCommandContext,
} from "./stack/types.ts";
import { confirmLandStackAction } from "./stack/pre-merge-confirmation.ts";
import { loadStackLandingShape, type LandingShape } from "./api.ts";
import { isIsolatedFastPath, runIsolatedFastPathLanding } from "./isolated-fast-path.ts";
import {
	approvedLandConfirmationKinds,
	planPostLandingSlotCleanup,
	postLandingCleanupRequestFromArgs,
	runPostLandingSlotCleanup,
	type PostLandingSlotCleanupPreview,
} from "./post-landing-slot-cleanup.ts";

interface RunLandingDispatchOptions {
	runtime: StackLandingRuntime;
	ctx: PrintAwareLandStackCommandContext;
	parsedArgs: ParsedArgs;
	observabilityChannels: FlowLandObservabilityChannels;
}

export async function runLandingDispatch(options: RunLandingDispatchOptions): Promise<LandOutcome> {
	const { runtime } = options;
	const { observabilityChannels } = options;
	const shape = await loadStackLandingShape(runtime.landContext, options.ctx.cwd);
	if (shape.type === "failure") {
		presentFailureAndReturn(options.ctx, shape.failure);
		return landOutcomeFailure(shape.failure);
	}

	const landContext = runtime.landContext;
	const cleanupPreview = planPostLandingSlotCleanup({
		args: options.parsedArgs,
		shape: shape.value,
	});
	if (isIsolatedFastPath(shape.value.stack)) {
		const result = await runIsolatedFastPathLanding({
			landContext,
			ctx: options.ctx,
			target: shape.value,
			isDryRun: options.parsedArgs.isDryRun,
			cleanup: postLandingCleanupRequestFromArgs(options.parsedArgs),
			approvedConfirmationKinds: approvedLandConfirmationKinds({
				flags: options.parsedArgs,
				wasUpfrontPromptApproved: false,
				...optionalEntry("cleanupPreview", cleanupPreview),
			}),
			...optionalEntry("progressIo", observabilityChannels.progressIo),
		});
		if (result.outcome.type === "failure") return result.outcome;
		return await runPostLandingSlotCleanup({
			landContext,
			ctx: options.ctx,
			args: options.parsedArgs,
			shape: shape.value,
			cleanupDecision: result.beforeMergeValue ?? { type: "not-needed" },
		});
	}

	const confirmationResult = await confirmStackModeIfNeeded(options.ctx, shape.value, {
		isDryRun: options.parsedArgs.isDryRun,
		shouldSkipConfirmation: options.parsedArgs.shouldSkipConfirmation,
		...optionalEntry("cleanupPreview", cleanupPreview),
	});
	if (confirmationResult.outcome.type === "failure") return confirmationResult.outcome;

	return await executeStackLanding(runtime.source, options.ctx, options.parsedArgs, {
		graphite: runtime.graphite,
		observabilityChannels,
		execution: {
			source: { type: "prepared", shape: shape.value },
			approvedConfirmationKinds: approvedLandConfirmationKinds({
				flags: options.parsedArgs,
				wasUpfrontPromptApproved: confirmationResult.wasPromptApproved,
				...optionalEntry("cleanupPreview", cleanupPreview),
			}),
		},
	});
}

interface StackModeConfirmationResult {
	readonly outcome: LandOutcome;
	readonly wasPromptApproved: boolean;
}

async function confirmStackModeIfNeeded(
	ctx: PrintAwareLandStackCommandContext,
	shape: LandingShape,
	options: {
		isDryRun: boolean;
		shouldSkipConfirmation: boolean;
		cleanupPreview?: PostLandingSlotCleanupPreview;
	},
): Promise<StackModeConfirmationResult> {
	const confirmationDetails = buildUpfrontStackConfirmation(shape, options.cleanupPreview);
	const shouldPrompt =
		shape.stack.landingBranches.length > 0 && !options.isDryRun && !options.shouldSkipConfirmation;
	const outcome = await confirmLandStackAction({
		ctx,
		shouldPrompt,
		title: "Land stack?",
		details:
			ctx.renderConfirmationDetails?.(confirmationDetails) ??
			renderPlainLandConfirmationDetails(confirmationDetails),
		nonInteractiveMessage:
			"Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.",
		defaultAnswer: "yes",
		onFailure: (failure) => presentFailureAndReturn(ctx, failure),
	});
	return { outcome, wasPromptApproved: outcome.type === "completed" && shouldPrompt };
}

export function buildUpfrontStackConfirmation(
	shape: LandingShape,
	cleanupPreview?: PostLandingSlotCleanupPreview,
): LandConfirmationPreview {
	const stack = shape.stack;
	const bottomBranch = stack.landingBranches[0] ?? stack.actualCurrentBranch;
	const prCount = `${stack.landingBranches.length} PR${stack.landingBranches.length === 1 ? "" : "s"}`;
	const cleanupImpactLine =
		cleanupPreview === undefined
			? undefined
			: `After a successful landing, free managed slot ${cleanupPreview.slotName} and delete local branch ${cleanupPreview.branch}.`;
	const cleanupPlanRow =
		cleanupPreview === undefined
			? undefined
			: {
					label: "Cleanup",
					value: `free ${cleanupPreview.slotName}; delete ${cleanupPreview.branch}`,
				};
	const descendantNotePlanRow =
		stack.descendantBranches.length === 0
			? undefined
			: {
					label: "Note",
					value: `${stack.descendantBranches.join(", ")} will not be merged; the command will try to maintain them after landing.`,
				};
	return {
		headline: "Review the landing plan before merging this stack.",
		impactLines: [
			"Squash-merge the selected Graphite path from bottom to top.",
			"Refresh remaining upstack PRs after each merge.",
			"Delete landed local Graphite branches once they are safe to remove.",
			...optionalListItem(cleanupImpactLine),
		],
		planRows: [
			{ label: "Stack", value: prCount },
			{ label: "Range", value: `${bottomBranch} → ${stack.actualCurrentBranch}` },
			{ label: "Target", value: stack.trunk },
			...optionalListItem(cleanupPlanRow),
			...optionalListItem(descendantNotePlanRow),
		],
		guidance: "Press Enter to proceed, or type n to cancel.",
	};
}

function optionalListItem<T>(item: T | undefined): T[] {
	return item === undefined ? [] : [item];
}
