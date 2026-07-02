import { normalizeExecResult, type ExecResult } from "@sdl/core/command";
import type { SdlCommandIo } from "@sdl/kernel/sdk";
import { executeStackLanding } from "../core/land-stack.ts";
import type { LandLiveProgressSink } from "../land-stack/command-stream.ts";
import { completed, type LandStackOutcome } from "../land-stack/errors.ts";
import { renderPlainLandConfirmationDetails } from "../land-stack/land-presentation.ts";
import { presentBrief, presentFailureOutcome } from "../land-stack/presentation.ts";
import { loadLandingShape } from "../land-stack/stack-facts.ts";
import type {
	LandingShape,
	LandConfirmationPreview,
	LandStackExtensionAPI,
	ParsedArgs,
	PrintAwareLandStackCommandContext,
} from "../land-stack/types.ts";
import { confirmLandStackAction } from "../land-stack/pre-merge-confirmation.ts";
import { isIsolatedFastPath, runIsolatedFastPathLanding } from "./isolated-fast-path.ts";
import { runPostLandingSlotCleanup } from "./post-landing-slot-cleanup.ts";

interface NormalizedLandExtensionAPI extends LandStackExtensionAPI {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
}

interface LandRuntimeApis {
	extensionApi: LandStackExtensionAPI;
	streamedApi: LandStackExtensionAPI;
}

interface RunLandingDispatchOptions {
	runtimeApis: LandRuntimeApis;
	ctx: PrintAwareLandStackCommandContext;
	parsedArgs: ParsedArgs;
	progressIo?: SdlCommandIo;
	liveProgress?: LandLiveProgressSink;
}

export async function runLandingDispatch(
	options: RunLandingDispatchOptions,
): Promise<LandStackOutcome> {
	const progressIo = options.progressIo;
	const { extensionApi, streamedApi } = options.runtimeApis;
	const normalizedApi = normalizeLandExtensionApi(streamedApi);
	const shape = await loadLandingShape(streamedApi, options.ctx.cwd);
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

	if (isIsolatedFastPath(shape.value.stack)) {
		const outcome = await runIsolatedFastPathLanding({
			pi: normalizedApi,
			ctx: options.ctx,
			target: shape.value,
			isDryRun: options.parsedArgs.isDryRun,
			...(progressIo === undefined ? {} : { progressIo }),
		});
		return await finishAfterLanding(outcome, {
			pi: normalizedApi,
			ctx: options.ctx,
			args: options.parsedArgs,
			shape: shape.value,
		});
	}

	const confirmationOutcome = await confirmStackModeIfNeeded(options.ctx, shape.value, {
		isDryRun: options.parsedArgs.isDryRun,
		shouldSkipConfirmation: options.parsedArgs.shouldSkipConfirmation,
	});
	if (confirmationOutcome.type === "failure") return confirmationOutcome;

	const outcome = await executeStackLanding(extensionApi, options.ctx, options.parsedArgs, {
		shouldSkipMainConfirmation: true,
		...(options.parsedArgs.shouldSkipConfirmation
			? {}
			: { preMergeConfirmation: "already-approved" }),
		initialShape: shape.value,
		...(progressIo === undefined ? {} : { io: progressIo }),
		...(options.liveProgress === undefined ? {} : { liveProgress: options.liveProgress }),
	});
	return await finishAfterLanding(outcome, {
		pi: streamedApi,
		ctx: options.ctx,
		args: options.parsedArgs,
		shape: shape.value,
	});
}

function normalizeLandExtensionApi(streamedApi: LandStackExtensionAPI): NormalizedLandExtensionAPI {
	return {
		...streamedApi,
		exec: async (command, args, options) =>
			normalizeExecResult(await streamedApi.exec(command, args, options)),
	};
}

async function finishAfterLanding(
	outcome: LandStackOutcome,
	options: {
		pi: LandStackExtensionAPI;
		ctx: PrintAwareLandStackCommandContext;
		args: ParsedArgs;
		shape: LandingShape;
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
