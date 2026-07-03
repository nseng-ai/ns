import type { SdlCommandIo } from "@sdl/kernel/sdk";
import { executeStackLanding } from "./land-stack.ts";
import type { LandLiveProgressSink } from "./stack/command-stream.ts";
import type { LandRuntime } from "./stack/land-runtime.ts";
import { completed, type LandStackOutcome } from "./stack/errors.ts";
import { renderPlainLandConfirmationDetails } from "./stack/land-presentation.ts";
import { presentBrief, presentFailureOutcome } from "./stack/presentation.ts";
import { loadLandingShape } from "./stack/stack-facts.ts";
import type {
	LandingShape,
	LandConfirmationPreview,
	ParsedArgs,
	PrintAwareLandStackCommandContext,
} from "./stack/types.ts";
import { confirmLandStackAction } from "./stack/pre-merge-confirmation.ts";
import { createLandContext } from "./stack/land-context-adapter.ts";
import type { LandContext } from "./api.ts";
import { isIsolatedFastPath, runIsolatedFastPathLanding } from "./isolated-fast-path.ts";
import { runPostLandingSlotCleanup } from "./post-landing-slot-cleanup.ts";

interface RunLandingDispatchOptions {
	runtime: LandRuntime;
	ctx: PrintAwareLandStackCommandContext;
	parsedArgs: ParsedArgs;
	progressIo?: SdlCommandIo;
	liveProgress?: LandLiveProgressSink;
}

export async function runLandingDispatch(
	options: RunLandingDispatchOptions,
): Promise<LandStackOutcome> {
	const progressIo = options.progressIo;
	const { runtime } = options;
	const shape = await loadLandingShape(runtime.commands, options.ctx.cwd, {
		graphite: runtime.graphite,
	});
	if (shape.type === "failure") {
		return presentFailureOutcome(options.ctx, shape.failure);
	}

	if (
		shape.value.stack.actualCurrentBranch === shape.value.stack.trunk ||
		shape.value.stack.landingBranches.length === 0
	) {
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

	const landContext = createLandContext(runtime.commands, { graphite: runtime.graphite });
	if (isIsolatedFastPath(shape.value.stack)) {
		const outcome = await runIsolatedFastPathLanding({
			github: landContext.github,
			ctx: options.ctx,
			target: shape.value,
			isDryRun: options.parsedArgs.isDryRun,
			...(progressIo === undefined ? {} : { progressIo }),
		});
		return await finishAfterLanding(outcome, {
			ctx: options.ctx,
			args: options.parsedArgs,
			shape: shape.value,
			landContext,
		});
	}

	const confirmationOutcome = await confirmStackModeIfNeeded(options.ctx, shape.value, {
		isDryRun: options.parsedArgs.isDryRun,
		shouldSkipConfirmation: options.parsedArgs.shouldSkipConfirmation,
	});
	if (confirmationOutcome.type === "failure") return confirmationOutcome;

	const outcome = await executeStackLanding(runtime.source, options.ctx, options.parsedArgs, {
		shouldSkipMainConfirmation: true,
		graphite: runtime.graphite,
		...(options.parsedArgs.shouldSkipConfirmation
			? {}
			: { preMergeConfirmation: "already-approved" }),
		...(progressIo === undefined ? {} : { io: progressIo }),
		...(options.liveProgress === undefined ? {} : { liveProgress: options.liveProgress }),
	});
	return await finishAfterLanding(outcome, {
		ctx: options.ctx,
		args: options.parsedArgs,
		shape: shape.value,
		landContext,
	});
}

async function finishAfterLanding(
	outcome: LandStackOutcome,
	options: {
		ctx: PrintAwareLandStackCommandContext;
		args: ParsedArgs;
		shape: LandingShape;
		landContext: LandContext;
	},
): Promise<LandStackOutcome> {
	if (outcome.type === "failure") return outcome;
	return await runPostLandingSlotCleanup(options);
}

async function confirmStackModeIfNeeded(
	ctx: PrintAwareLandStackCommandContext,
	shape: LandingShape,
	options: { isDryRun: boolean; shouldSkipConfirmation: boolean },
): Promise<LandStackOutcome> {
	const confirmationDetails = buildUpfrontStackConfirmation(shape);
	return await confirmLandStackAction({
		ctx,
		shouldPrompt: !options.isDryRun && !options.shouldSkipConfirmation,
		title: "Land stack?",
		details:
			ctx.renderConfirmationDetails?.(confirmationDetails) ??
			renderPlainLandConfirmationDetails(confirmationDetails),
		nonInteractiveMessage:
			"Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.",
		defaultAnswer: "yes",
		onFailure: (landFailure) => presentFailureOutcome(ctx, landFailure),
	});
}

function buildUpfrontStackConfirmation(shape: LandingShape): LandConfirmationPreview {
	const stack = shape.stack;
	const bottomBranch = stack.landingBranches[0] ?? stack.actualCurrentBranch;
	const prCount = `${stack.landingBranches.length} PR${stack.landingBranches.length === 1 ? "" : "s"}`;
	return {
		headline: "Review the landing plan before merging this stack.",
		impactLines: [
			"Squash-merge the selected Graphite path from bottom to top.",
			"Refresh remaining upstack PRs after each merge.",
			"Delete landed local Graphite branches once they are safe to remove.",
		],
		planRows: [
			{ label: "Stack", value: prCount },
			{ label: "Range", value: `${bottomBranch} → ${stack.actualCurrentBranch}` },
			{ label: "Target", value: stack.trunk },
			...(stack.descendantBranches.length === 0
				? []
				: [
						{
							label: "Note",
							value: `${stack.descendantBranches.join(", ")} will not be merged; the command will try to maintain them after landing.`,
						},
					]),
		],
		guidance: "Press Enter to proceed, or type n to cancel.",
	};
}
