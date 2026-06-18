import { formatErrorMessage } from "@asdl/core/primitives";
import {
	LandStackCommandStream,
	commandStreamDetailsForLanded,
	renderCommandStreamMessage,
	withCommandStreaming,
} from "./land-stack/command-stream.ts";
import {
	AUTO_CHUNK_LANDING_SIZE,
	AUTO_CHUNK_LANDING_THRESHOLD,
	COMMAND_NAME,
	COMMAND_STREAM_MESSAGE_TYPE,
} from "./land-stack/constants.ts";
import {
	failure,
	landStackFailure,
	success,
	type LandStackFailure,
	type LandStackResult,
} from "./land-stack/errors.ts";
import { buildLandingPlan } from "./land-stack/landing-plan.ts";
import {
	confirmAndFreeManagedSlots,
	confirmAndSubmitRequiredPrUpdates,
	prepareMergeLoopState,
	residualPreMergeFailure,
	runMergeLoop,
	type MergeLoopState,
	type PreMergeConfirmation,
} from "./land-stack/landing-operations.ts";
import {
	formatChunkedPlan,
	formatChunkedSuccessSummary,
	formatFailure,
	formatFailureNotification,
	formatPlan,
	formatSuccessNotification,
	formatSuccessSummary,
	present,
	presentBrief,
	setStatus,
	usage,
} from "./land-stack/presentation.ts";
import { loadLandingShape } from "./land-stack/stack-facts.ts";
import type {
	LandStackCommandContext,
	LandStackExtensionAPI,
	LandedChunk,
	LandedPr,
	LandingPlan,
	LandingShape,
	LandingWarning,
	ParsedArgs,
} from "./land-stack/types.ts";

export type { LandStackExtensionAPI } from "./land-stack/types.ts";

export interface ExecuteStackLandingOptions {
	skipMainConfirmation?: boolean;
	initialShape?: LandingShape;
}

export function registerLandStackRenderer(
	pi: Pick<LandStackExtensionAPI, "registerMessageRenderer">,
): void {
	pi.registerMessageRenderer?.(COMMAND_STREAM_MESSAGE_TYPE, renderCommandStreamMessage);
}

export function landArgumentCompletions(
	prefix: string,
): Array<{ value: string; label: string }> | null {
	const options = ["--yes", "--dry-run", "--help"];
	const token = prefix.trim().split(/\s+/).pop() ?? "";
	const filtered = options.filter((option) => option.startsWith(token));
	return filtered.length > 0 ? filtered.map((option) => ({ value: option, label: option })) : null;
}

export async function executeStackLanding(
	pi: LandStackExtensionAPI,
	ctx: LandStackCommandContext,
	parsedArgs: ParsedArgs,
	options: ExecuteStackLandingOptions = {},
): Promise<void> {
	const landed: LandedPr[] = [];
	const landedChunks: LandedChunk[] = [];
	const warnings: LandingWarning[] = [];
	const commandStream = new LandStackCommandStream(pi, ctx);
	const runtimePi = withCommandStreaming(pi, commandStream);
	try {
		if (parsedArgs.help) {
			present(ctx, usage(), "info");
			return;
		}

		setStatus(ctx, "preflighting...");
		const shape = options.initialShape
			? success(options.initialShape)
			: await loadLandingShape(runtimePi, ctx.cwd);
		if (shape.type === "failure") {
			presentLandStackFailure({ ctx, commandStream, landed, landedChunks, failure: shape.failure });
			return;
		}

		if (shape.value.stack.landingBranches.length > AUTO_CHUNK_LANDING_THRESHOLD) {
			await executeChunkedStackLanding({
				pi,
				runtimePi,
				ctx,
				parsedArgs,
				options,
				commandStream,
				initialShape: shape.value,
				landed,
				landedChunks,
				warnings,
			});
			return;
		}

		const plan = await buildLandingPlan(runtimePi, ctx.cwd, {
			allowSubmitRequiredState: true,
			preloadedShape: shape.value,
		});
		if (plan.type === "failure") {
			presentLandStackFailure({ ctx, commandStream, landed, landedChunks, failure: plan.failure });
			return;
		}
		await executeSinglePlanLanding({
			pi,
			runtimePi,
			ctx,
			parsedArgs,
			options,
			commandStream,
			plan: plan.value,
			landed,
			landedChunks,
			warnings,
		});
	} catch (error) {
		presentLandStackFailure({
			ctx,
			commandStream,
			landed,
			landedChunks,
			failure: landStackFailure(`land failed unexpectedly: ${formatErrorMessage(error)}`),
		});
	} finally {
		setStatus(ctx, undefined);
	}
}

interface ExecuteSinglePlanLandingOptions {
	pi: LandStackExtensionAPI;
	runtimePi: LandStackExtensionAPI;
	ctx: LandStackCommandContext;
	parsedArgs: ParsedArgs;
	options: ExecuteStackLandingOptions;
	commandStream: LandStackCommandStream;
	plan: LandingPlan;
	landed: LandedPr[];
	landedChunks: LandedChunk[];
	warnings: LandingWarning[];
}

async function executeSinglePlanLanding(
	singleOptions: ExecuteSinglePlanLandingOptions,
): Promise<LandStackResult<void>> {
	const {
		pi,
		runtimePi,
		ctx,
		parsedArgs,
		options,
		commandStream,
		plan,
		landed,
		landedChunks,
		warnings,
	} = singleOptions;
	const planText = formatPlan(plan);

	if (parsedArgs.dryRun) {
		commandStream.finishSuccess("Dry run only; no PRs or local refs were changed.");
		present(ctx, `Dry run only; no PRs or local refs were changed.\n\n${planText}`, "info");
		return success(undefined);
	}

	if (!parsedArgs.yes && !options.skipMainConfirmation) {
		if (!ctx.hasUI) {
			const landFailure = landStackFailure(
				`Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.\n\n${planText}`,
			);
			presentLandStackFailure({ ctx, commandStream, landed, landedChunks, failure: landFailure });
			return failure(landFailure);
		}
		const confirmed = await ctx.ui.confirm("Land this stack path?", planText);
		if (!confirmed) {
			const landFailure = landStackFailure("Cancelled before merge; no PRs were landed.", {
				level: "info",
			});
			presentLandStackFailure({ ctx, commandStream, landed, landedChunks, failure: landFailure });
			return failure(landFailure);
		}
	}

	const readyPlan = await preparePlanForMerge({
		runtimePi,
		ctx,
		plan,
		landed,
		landedChunks,
		commandStream,
	});
	if (readyPlan.type === "failure") return readyPlan;

	const mergeOutcome = await runMergeLoop(runtimePi, ctx, readyPlan.value, landed, warnings, {
		commandStream,
		unstreamedPi: pi,
	});
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

	const successSummary = formatSuccessSummary(
		landed,
		readyPlan.value.descendantMaintenance,
		warnings,
		mergeOutcome.value,
	);
	const hasWarnings = warnings.some((warning) => (warning.level ?? "warning") === "warning");
	const completionLevel = hasWarnings ? "warning" : "success";
	const commandStreamDetails = commandStreamDetailsForLanded(landed);
	commandStream.finishSuccess(successSummary, commandStreamDetails);
	presentBrief(
		ctx,
		successSummary,
		completionLevel,
		formatSuccessNotification(successSummary, { details: commandStreamDetails, warnings }),
	);
	return success(undefined);
}

interface ExecuteChunkedStackLandingOptions {
	pi: LandStackExtensionAPI;
	runtimePi: LandStackExtensionAPI;
	ctx: LandStackCommandContext;
	parsedArgs: ParsedArgs;
	options: ExecuteStackLandingOptions;
	commandStream: LandStackCommandStream;
	initialShape: LandingShape;
	landed: LandedPr[];
	landedChunks: LandedChunk[];
	warnings: LandingWarning[];
}

async function executeChunkedStackLanding(
	chunkedOptions: ExecuteChunkedStackLandingOptions,
): Promise<void> {
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
		return;
	}

	const chunkPlanText = formatChunkedPlan(initialPlan.value, AUTO_CHUNK_LANDING_SIZE);
	if (parsedArgs.dryRun) {
		commandStream.finishSuccess("Dry run only; no PRs or local refs were changed.");
		present(ctx, `Dry run only; no PRs or local refs were changed.\n\n${chunkPlanText}`, "info");
		return;
	}

	if (!parsedArgs.yes && !options.skipMainConfirmation) {
		if (!ctx.hasUI) {
			presentLandStackFailure({
				ctx,
				commandStream,
				landed,
				landedChunks,
				failure: landStackFailure(
					`Refusing to land a chunked stack without confirmation in non-interactive mode. Re-run with --yes.\n\n${chunkPlanText}`,
				),
			});
			return;
		}
		const confirmed = await ctx.ui.confirm("Land this stack in chunks?", chunkPlanText);
		if (!confirmed) {
			presentLandStackFailure({
				ctx,
				commandStream,
				landed,
				landedChunks,
				failure: landStackFailure("Cancelled before merge; no PRs were landed.", { level: "info" }),
			});
			return;
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
			return;
		}
		finalPlan = plan.value;

		const readyPlan = await preparePlanForMerge({
			runtimePi,
			ctx,
			plan: plan.value,
			landed,
			landedChunks,
			commandStream,
			preMergeConfirmation: "already-approved",
		});
		if (readyPlan.type === "failure") return;
		finalPlan = readyPlan.value;

		if (!mergeState) {
			const backupBranches = [
				...initialShape.stack.landingBranches,
				...initialShape.stack.descendantBranches,
			];
			const prepared = await prepareMergeLoopState(
				runtimePi,
				readyPlan.value.repoRoot,
				backupBranches,
				warnings,
			);
			if (prepared.type === "failure") {
				presentLandStackFailure({
					ctx,
					commandStream,
					landed,
					landedChunks,
					failure: prepared.failure,
				});
				return;
			}
			mergeState = prepared.value;
		}

		const landedStart = landed.length;
		const mergeOutcome = await runMergeLoop(runtimePi, ctx, readyPlan.value, landed, warnings, {
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
			return;
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
	presentBrief(
		ctx,
		successSummary,
		completionLevel,
		formatSuccessNotification(successSummary, { details: commandStreamDetails, warnings }),
	);
}

interface PreparePlanForMergeOptions {
	runtimePi: LandStackExtensionAPI;
	ctx: LandStackCommandContext;
	plan: LandingPlan;
	landed: readonly LandedPr[];
	landedChunks: readonly LandedChunk[];
	commandStream: LandStackCommandStream;
	preMergeConfirmation?: PreMergeConfirmation;
}

async function preparePlanForMerge(
	options: PreparePlanForMergeOptions,
): Promise<LandStackResult<LandingPlan>> {
	const { runtimePi, ctx, plan, landed, landedChunks, commandStream } = options;
	const preMergeConfirmation = options.preMergeConfirmation ?? "prompt";
	if (plan.managedSlotConflicts.length > 0) {
		const slotOutcome = await confirmAndFreeManagedSlots({
			pi: runtimePi,
			ctx,
			plan,
			confirmation: preMergeConfirmation,
		});
		if (slotOutcome.type === "failure") {
			presentLandStackFailure({
				ctx,
				commandStream,
				landed,
				landedChunks,
				failure: slotOutcome.failure,
			});
			return slotOutcome;
		}
	}

	if (plan.prSubmitRequirements.length > 0) {
		const submitOutcome = await confirmAndSubmitRequiredPrUpdates({
			pi: runtimePi,
			ctx,
			plan,
			confirmation: preMergeConfirmation,
		});
		if (submitOutcome.type === "failure") {
			presentLandStackFailure({
				ctx,
				commandStream,
				landed,
				landedChunks,
				failure: submitOutcome.failure,
			});
			return submitOutcome;
		}
		setStatus(ctx, "rechecking preflight...");
		const rechecked = await buildLandingPlan(runtimePi, ctx.cwd, {
			allowSubmitRequiredState: true,
			landingBranchLimit: plan.stack.landingBranches.length,
		});
		if (rechecked.type === "failure") {
			presentLandStackFailure({
				ctx,
				commandStream,
				landed,
				landedChunks,
				failure: rechecked.failure,
			});
			return rechecked;
		}
		const residualFailure = residualPreMergeFailure(rechecked.value);
		if (residualFailure) {
			presentLandStackFailure({
				ctx,
				commandStream,
				landed,
				landedChunks,
				failure: residualFailure,
			});
			return failure(residualFailure);
		}
		return rechecked;
	}

	return success(plan);
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

interface PresentLandStackFailureOptions {
	ctx: LandStackCommandContext;
	commandStream: LandStackCommandStream;
	landed: readonly LandedPr[];
	landedChunks: readonly LandedChunk[];
	failure: LandStackFailure;
}

function presentLandStackFailure(options: PresentLandStackFailureOptions): void {
	const { ctx, commandStream, landed, landedChunks, failure } = options;
	const formatted = formatFailure(failure, landed, landedChunks);
	commandStream.finishFailure(formatted);
	presentBrief(ctx, formatted, failure.level, formatFailureNotification(failure));
}

export function parseArgs(argsText: string): LandStackResult<ParsedArgs> {
	const parsed: ParsedArgs = { yes: false, dryRun: false, help: false };
	const parts = argsText.trim().split(/\s+/).filter(Boolean);

	for (const part of parts) {
		if (part === "--yes" || part === "-y") {
			parsed.yes = true;
		} else if (part === "--dry-run") {
			parsed.dryRun = true;
		} else if (part === "--help" || part === "-h") {
			parsed.help = true;
		} else {
			return failure(landStackFailure(`Unknown /${COMMAND_NAME} argument: ${part}\n\n${usage()}`));
		}
	}

	return success(parsed);
}
