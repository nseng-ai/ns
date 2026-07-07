import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { executeStackLanding } from "./land-stack.ts";
import type { FlowLandObservabilityChannels } from "./stack/command-stream.ts";
import { createRuntimeLandContext, type LandRuntime } from "./stack/land-runtime.ts";
import { completed, type LandStackOutcome } from "./stack/errors.ts";
import { renderPlainLandConfirmationDetails } from "./stack/land-presentation.ts";
import { presentBrief, presentFailureAndReturn } from "./stack/presentation.ts";
import { loadLandingShape } from "./stack/stack-facts.ts";
import type {
	LandingShape,
	LandConfirmationPreview,
	ParsedArgs,
	PrintAwareLandStackCommandContext,
} from "./stack/types.ts";
import {
	confirmLandStackAction,
	type PreMergeConfirmation,
} from "./stack/pre-merge-confirmation.ts";
import type { LandContext } from "./api.ts";
import { isIsolatedFastPath, runIsolatedFastPathLanding } from "./isolated-fast-path.ts";
import {
	planPostLandingSlotCleanup,
	resolvePostLandingSlotCleanupDecision,
	runPostLandingSlotCleanup,
	type PostLandingSlotCleanupDecision,
	type PostLandingSlotCleanupPreview,
} from "./post-landing-slot-cleanup.ts";

interface RunLandingDispatchOptions {
	runtime: LandRuntime;
	ctx: PrintAwareLandStackCommandContext;
	parsedArgs: ParsedArgs;
	observabilityChannels: FlowLandObservabilityChannels;
}

export async function runLandingDispatch(
	options: RunLandingDispatchOptions,
): Promise<LandStackOutcome> {
	const { runtime } = options;
	const { observabilityChannels } = options;
	const shape = await loadLandingShape(runtime.commands, options.ctx.cwd, {
		graphite: runtime.graphite,
	});
	if (shape.type === "failure") {
		return presentFailureAndReturn(options.ctx, shape.failure);
	}

	const landContext = createRuntimeLandContext(runtime);
	const cleanupPreview = planPostLandingSlotCleanup({
		args: options.parsedArgs,
		shape: shape.value,
	});
	if (
		shape.value.stack.actualCurrentBranch === shape.value.stack.trunk ||
		shape.value.stack.landingBranches.length === 0
	) {
		if (cleanupPreview !== undefined) {
			return await resolveAndFinishPostLandingCleanup({
				ctx: options.ctx,
				args: options.parsedArgs,
				shape: shape.value,
				landContext,
			});
		}
		const message = `Current branch is ${shape.value.stack.actualCurrentBranch}, which is trunk or has no PR path to land. Nothing to do.`;
		presentBrief({
			ctx: options.ctx,
			fullMessage: message,
			level: "info",
			uiMessage: message,
			kind: "refusal",
		});
		return completed();
	}

	if (isIsolatedFastPath(shape.value.stack)) {
		const result = await runIsolatedFastPathLanding<PostLandingSlotCleanupDecision>({
			github: landContext.github,
			ctx: options.ctx,
			target: shape.value,
			isDryRun: options.parsedArgs.isDryRun,
			beforeMerge: () =>
				resolvePostLandingSlotCleanupDecision({
					ctx: options.ctx,
					args: options.parsedArgs,
					shape: shape.value,
				}),
			...optionalEntry("progressIo", observabilityChannels.progressIo),
		});
		return await finishAfterLanding(result.outcome, {
			ctx: options.ctx,
			args: options.parsedArgs,
			shape: shape.value,
			landContext,
			cleanupDecision: result.beforeMergeValue ?? { type: "not-needed" },
		});
	}

	const confirmationResult = await confirmStackModeIfNeeded(options.ctx, shape.value, {
		isDryRun: options.parsedArgs.isDryRun,
		shouldSkipConfirmation: options.parsedArgs.shouldSkipConfirmation,
		...optionalEntry("cleanupPreview", cleanupPreview),
	});
	if (confirmationResult.outcome.type === "failure") return confirmationResult.outcome;

	const cleanupDecision = await resolvePostLandingCleanupForDispatch({
		ctx: options.ctx,
		args: options.parsedArgs,
		shape: shape.value,
		...optionalEntry("confirmation", confirmationResult.cleanupConfirmation),
	});
	if (cleanupDecision.type === "outcome") return cleanupDecision.outcome;

	const outcome = await executeStackLanding(runtime.source, options.ctx, options.parsedArgs, {
		shouldSkipMainConfirmation: true,
		graphite: runtime.graphite,
		...(options.parsedArgs.shouldSkipConfirmation
			? {}
			: { preMergeConfirmation: "already-approved" }),
		observabilityChannels,
	});
	return await finishAfterLanding(outcome, {
		ctx: options.ctx,
		args: options.parsedArgs,
		shape: shape.value,
		landContext,
		cleanupDecision: cleanupDecision.value,
	});
}

interface FinishAfterLandingOptions {
	ctx: PrintAwareLandStackCommandContext;
	args: ParsedArgs;
	shape: LandingShape;
	landContext: LandContext;
	cleanupDecision: PostLandingSlotCleanupDecision;
}

async function finishAfterLanding(
	outcome: LandStackOutcome,
	options: FinishAfterLandingOptions,
): Promise<LandStackOutcome> {
	if (outcome.type === "failure") return outcome;
	return await runPostLandingSlotCleanup(options);
}

async function resolveAndFinishPostLandingCleanup(
	options: Omit<FinishAfterLandingOptions, "cleanupDecision"> & {
		confirmation?: PreMergeConfirmation;
	},
): Promise<LandStackOutcome> {
	const cleanupDecision = await resolvePostLandingCleanupForDispatch(options);
	if (cleanupDecision.type === "outcome") return cleanupDecision.outcome;
	return await runPostLandingSlotCleanup({
		...options,
		cleanupDecision: cleanupDecision.value,
	});
}

type DispatchCleanupDecision =
	| { readonly type: "decision"; readonly value: PostLandingSlotCleanupDecision }
	| { readonly type: "outcome"; readonly outcome: LandStackOutcome };

async function resolvePostLandingCleanupForDispatch(options: {
	ctx: PrintAwareLandStackCommandContext;
	args: ParsedArgs;
	shape: LandingShape;
	confirmation?: PreMergeConfirmation;
}): Promise<DispatchCleanupDecision> {
	const cleanupDecision = await resolvePostLandingSlotCleanupDecision(options);
	if (cleanupDecision.type === "failure") return { type: "outcome", outcome: cleanupDecision };
	return { type: "decision", value: cleanupDecision.value };
}

interface StackModeConfirmationResult {
	outcome: LandStackOutcome;
	cleanupConfirmation?: PreMergeConfirmation;
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
	const shouldPrompt = !options.isDryRun && !options.shouldSkipConfirmation;
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
		onFailure: (landFailure) => presentFailureAndReturn(ctx, landFailure),
	});
	const cleanupConfirmation: PreMergeConfirmation | undefined =
		outcome.type === "success" && options.cleanupPreview !== undefined && shouldPrompt
			? "already-approved"
			: undefined;
	return { outcome, ...optionalEntry("cleanupConfirmation", cleanupConfirmation) };
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
