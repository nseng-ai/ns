import { LandStackCommandStream, commandStreamDetailsForLanded } from "./command-stream.ts";
import { AUTO_CHUNK_LANDING_SIZE } from "./constants.ts";
import { completed, failure, landStackFailure, success, type LandStackOutcome } from "./errors.ts";
import { buildLandingPlan } from "./landing-plan.ts";
import {
	formatPreparingLandingMilestone,
	preparePlanForMerge,
	presentLandStackFailure,
} from "./landing-coordination.ts";
import { prepareMergeLoopState, runMergeLoop, type MergeLoopState } from "./landing-operations.ts";
import {
	formatChunkedPlan,
	formatChunkedSuccessSummary,
	formatSuccessNotification,
	present,
	presentBrief,
	setStatus,
} from "./presentation.ts";
import type {
	LandStackCommandContext,
	LandStackExtensionAPI,
	LandedChunk,
	LandedPr,
	LandingPlan,
	LandingShape,
	LandingWarning,
	ParsedArgs,
} from "./types.ts";

interface ExecuteChunkedStackLandingOptions {
	pi: LandStackExtensionAPI;
	runtimePi: LandStackExtensionAPI;
	ctx: LandStackCommandContext;
	parsedArgs: ParsedArgs;
	options: {
		skipMainConfirmation?: boolean;
	};
	commandStream: LandStackCommandStream;
	initialShape: LandingShape;
	landed: LandedPr[];
	landedChunks: LandedChunk[];
	warnings: LandingWarning[];
}

export async function executeChunkedStackLanding(
	chunkedOptions: ExecuteChunkedStackLandingOptions,
): Promise<LandStackOutcome> {
	const {
		pi,
		runtimePi,
		ctx,
		parsedArgs,
		options,
		commandStream,
		initialShape,
		landed,
		landedChunks,
		warnings,
	} = chunkedOptions;
	const initialPlan = await buildLandingPlan(runtimePi, ctx.cwd, {
		allowSubmitRequiredState: true,
		preloadedShape: initialShape,
		landingBranchLimit: AUTO_CHUNK_LANDING_SIZE,
	});
	if (initialPlan.type === "failure") {
		presentLandStackFailure({
			ctx,
			commandStream,
			landed,
			landedChunks,
			failure: initialPlan.failure,
		});
		return failure(initialPlan.failure);
	}

	const chunkPlanText = formatChunkedPlan(initialPlan.value, AUTO_CHUNK_LANDING_SIZE);
	if (parsedArgs.isDryRun) {
		commandStream.finishSuccess("Dry run only; no PRs or local refs were changed.");
		present({
			ctx,
			message: `Dry run only; no PRs or local refs were changed.\n\n${chunkPlanText}`,
			level: "info",
			kind: "success",
		});
		return completed();
	}

	if (!parsedArgs.shouldSkipConfirmation && !options.skipMainConfirmation) {
		if (!ctx.hasUI) {
			const landFailure = landStackFailure(
				`Refusing to land a chunked stack without confirmation in non-interactive mode. Re-run with --yes.\n\n${chunkPlanText}`,
				{ outcome: "refusal" },
			);
			presentLandStackFailure({
				ctx,
				commandStream,
				landed,
				landedChunks,
				failure: landFailure,
			});
			return failure(landFailure);
		}
		const confirmed = await ctx.ui.confirm("Land this stack in chunks?", chunkPlanText);
		if (!confirmed) {
			const landFailure = landStackFailure("Cancelled before merge; no PRs were landed.", {
				level: "info",
				outcome: "refusal",
			});
			presentLandStackFailure({
				ctx,
				commandStream,
				landed,
				landedChunks,
				failure: landFailure,
			});
			return failure(landFailure);
		}
	}

	let mergeState: MergeLoopState | undefined;
	let chunkIndex = 1;
	let pendingPlan: LandingPlan | undefined = initialPlan.value;
	let finalPlan: LandingPlan = initialPlan.value;
	let finalCleanup = mergeState?.cleanup ?? { retainedLocalBranches: [] };

	while (true) {
		setStatus(ctx, `preflighting chunk ${chunkIndex}...`);
		const plan = pendingPlan
			? success(pendingPlan)
			: await buildLandingPlan(runtimePi, ctx.cwd, {
					allowSubmitRequiredState: true,
					landingBranchLimit: AUTO_CHUNK_LANDING_SIZE,
				});
		pendingPlan = undefined;
		if (plan.type === "failure") {
			presentLandStackFailure({ ctx, commandStream, landed, landedChunks, failure: plan.failure });
			return failure(plan.failure);
		}
		finalPlan = plan.value;

		commandStream.note(
			`Preparing chunk ${chunkIndex}: ${formatPreparingLandingMilestone(plan.value)}`,
		);
		const readyPlan = await preparePlanForMerge({
			runtimePi,
			ctx,
			plan: plan.value,
			landed,
			landedChunks,
			commandStream,
			preMergeConfirmation: "already-approved",
		});
		if (readyPlan.type === "failure") return failure(readyPlan.failure);
		finalPlan = readyPlan.value;

		if (!mergeState) {
			const backupBranches = [
				...initialShape.stack.landingBranches,
				...initialShape.stack.descendantBranches,
			];
			const prepared = await prepareMergeLoopState({
				pi: runtimePi,
				repoRoot: readyPlan.value.repoRoot,
				branches: backupBranches,
				warnings,
			});
			if (prepared.type === "failure") {
				presentLandStackFailure({
					ctx,
					commandStream,
					landed,
					landedChunks,
					failure: prepared.failure,
				});
				return failure(prepared.failure);
			}
			mergeState = prepared.value;
		}

		const landedStart = landed.length;
		const mergeOutcome = await runMergeLoop({
			pi: runtimePi,
			ctx,
			plan: readyPlan.value,
			landed,
			warnings,
			commandStream,
			unstreamedPi: pi,
			mergeState,
		});
		appendLandedChunk(
			landedChunks,
			chunkIndex,
			readyPlan.value.stack.landingTargetBranch,
			landed.slice(landedStart),
		);
		finalCleanup = mergeState.cleanup;
		if (mergeOutcome.type === "failure") {
			presentLandStackFailure({
				ctx,
				commandStream,
				landed,
				landedChunks,
				failure: mergeOutcome.failure,
			});
			return mergeOutcome;
		}

		if (readyPlan.value.stack.remainingLandingBranches.length === 0) {
			break;
		}
		chunkIndex += 1;
	}

	const successSummary = formatChunkedSuccessSummary(
		landedChunks,
		finalPlan.descendantMaintenance,
		warnings,
		finalCleanup,
	);
	const hasWarnings = warnings.some((warning) => (warning.level ?? "warning") === "warning");
	const completionLevel = hasWarnings ? "warning" : "success";
	const commandStreamDetails = commandStreamDetailsForLanded(landed);
	commandStream.finishSuccess(successSummary, commandStreamDetails);
	presentBrief({
		ctx,
		fullMessage: successSummary,
		level: completionLevel,
		uiMessage: formatSuccessNotification(successSummary, {
			...(commandStreamDetails === undefined ? {} : { details: commandStreamDetails }),
			warnings,
		}),
		kind: "success",
	});
	return completed();
}

function appendLandedChunk(
	chunks: LandedChunk[],
	index: number,
	landingTargetBranch: string,
	landed: LandedPr[],
): void {
	if (landed.length === 0) return;
	chunks.push({ index, landingTargetBranch, landed });
}
