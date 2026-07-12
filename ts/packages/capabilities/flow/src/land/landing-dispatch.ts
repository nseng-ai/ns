import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { executeStackLanding } from "./land-stack.ts";
import type { FlowLandObservabilityChannels } from "./stack/command-stream.ts";
import type { StackLandingRuntime } from "./stack/stack-landing-runtime.ts";
import { landCompleted, landOutcomeFailure, type LandOutcome } from "./results.ts";
import {
	formatPostLandingCleanupSuccessNotice,
	notifyPrintAware,
	presentBrief,
	presentFailureAndReturn,
	renderPlainLandConfirmationDetails,
} from "./land-presentation.ts";
import type {
	LandConfirmationPreview,
	ParsedArgs,
	PrintAwareLandStackCommandContext,
} from "./stack/types.ts";
import { confirmLandStackAction } from "./stack/pre-merge-confirmation.ts";
import {
	executeLanding,
	loadStackLandingShape,
	type LandingRequest,
	type LandingShape,
} from "./api.ts";
import type { StackLandingShape } from "./preflight.ts";
import {
	createFlowLandConfirmationGateway,
	createUpfrontApprovedLandConfirmationGateway,
} from "./flow-land-confirmation-gateway.ts";
import { isIsolatedFastPath, runIsolatedFastPathLanding } from "./isolated-fast-path.ts";
import {
	approvedLandConfirmationKinds,
	createCleanupProgress,
	landingCleanupPolicyFromArgs,
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
	if (
		shape.value.stack.actualCurrentBranch === shape.value.stack.trunk ||
		shape.value.stack.landingBranches.length === 0
	) {
		if (cleanupPreview !== undefined) {
			return await runCleanupOnlyLanding({
				runtime,
				ctx: options.ctx,
				args: options.parsedArgs,
				shape: shape.value,
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
		return landCompleted();
	}

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

interface RunCleanupOnlyLandingOptions {
	readonly runtime: StackLandingRuntime;
	readonly ctx: PrintAwareLandStackCommandContext;
	readonly args: ParsedArgs;
	readonly shape: StackLandingShape;
}

/** Trunk/no-PR-path managed-slot checkout: canonical execution runs cleanup-only landing. */
async function runCleanupOnlyLanding(options: RunCleanupOnlyLandingOptions): Promise<LandOutcome> {
	const request: LandingRequest = {
		cwd: options.ctx.cwd,
		target: { type: "stack" },
		mode: options.args.isDryRun ? "dry-run" : "execute",
		preflight: { shouldAllowSubmitRequiredState: true },
		cleanup: landingCleanupPolicyFromArgs(options.args),
	};
	const execution = await executeLanding({
		context: options.runtime.landContext,
		request,
		host: {
			confirmation: createUpfrontApprovedLandConfirmationGateway(
				createFlowLandConfirmationGateway(options.ctx),
				approvedLandConfirmationKinds({
					flags: options.args,
					wasUpfrontPromptApproved: false,
					...optionalEntry(
						"cleanupPreview",
						planPostLandingSlotCleanup({ args: options.args, shape: options.shape }),
					),
				}),
			),
			progress: createCleanupProgress(options.ctx),
		},
		source: { type: "prepared", shape: options.shape },
	});
	if (execution.type === "failed") {
		presentFailureAndReturn(options.ctx, execution.failure);
		return landOutcomeFailure(execution.failure);
	}
	const postCleanup = execution.report.cleanup.postLandingSlotCleanup;
	if (postCleanup.type === "completed") {
		notifyPrintAware({
			ctx: options.ctx,
			message: formatPostLandingCleanupSuccessNotice(postCleanup),
			level: "success",
			kind: "success",
		});
	}
	return landCompleted();
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
