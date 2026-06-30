import { LandStackCommandStream } from "./command-stream.ts";
import { AUTO_CHUNK_LANDING_SIZE } from "./constants.ts";
import { completed, failure, success, type LandStackOutcome } from "./errors.ts";
import { buildLandingPlan } from "./landing-plan.ts";
import {
	confirmMainLanding,
	formatPreparingLandingMilestone,
	preparePlanForMerge,
	presentLandStackFailure,
} from "./landing-coordination.ts";
import { prepareMergeLoopState, runMergeLoop, type MergeLoopState } from "./landing-operations.ts";
import {
	formatChunkedPlan,
	formatChunkedSuccessSummary,
	presentDryRunLanding,
	presentLandingSuccess,
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
		shouldSkipMainConfirmation?: boolean;
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
		presentDryRunLanding({ ctx, commandStream, planText: chunkPlanText });
		return completed();
	}

	const confirmation = await confirmMainLanding({
		ctx,
		commandStream,
		landed,
		landedChunks,
		shouldPrompt: !parsedArgs.shouldSkipConfirmation && !options.shouldSkipMainConfirmation,
		title: "Land this stack in chunks?",
		details: chunkPlanText,
		nonInteractiveMessage: `Refusing to land a chunked stack without confirmation in non-interactive mode. Re-run with --yes.\n\n${chunkPlanText}`,
	});
	if (confirmation.type === "failure") return confirmation;

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
		landedChunks.splice(
			0,
			landedChunks.length,
			...appendLandedChunk({
				chunks: landedChunks,
				index: chunkIndex,
				landingTargetBranch: readyPlan.value.stack.landingTargetBranch,
				landed: landed.slice(landedStart),
			}),
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
	presentLandingSuccess({ ctx, commandStream, landed, warnings, successSummary });
	return completed();
}

interface AppendLandedChunkOptions {
	chunks: readonly LandedChunk[];
	index: number;
	landingTargetBranch: string;
	landed: readonly LandedPr[];
}

function appendLandedChunk(options: AppendLandedChunkOptions): LandedChunk[] {
	if (options.landed.length === 0) return [...options.chunks];
	return [
		...options.chunks,
		{
			index: options.index,
			landingTargetBranch: options.landingTargetBranch,
			landed: [...options.landed],
		},
	];
}
