import {
	BLOCK_THERMO_COUNCIL_REVIEW_TOOL,
	SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
	THERMO_COUNCIL_COMMAND_NAME,
	THERMO_COUNCIL_MESSAGE_TYPE,
	blockThermoCouncilReviewTool,
	submitThermoCouncilReviewTool,
	type ThermoCouncilReviewerOutcome,
	type ThermoCouncilSeatConfig,
} from "./contract.ts";
import {
	createSubprocessSubagentRuntime,
	mapWithConcurrency,
	trackSubagentFleetRun,
	type RunnerSubagentResult,
	type RunnerSubagentUpdate,
	type SubagentFleetRegistry,
	type SubagentFleetRunTracking,
	type SubagentFleetTaskInput,
	type SubagentRuntime,
} from "@nseng-ai/ns-pi-subagents/api";
import { errorMessage } from "@nseng-ai/pi/shared/errors";
import { createPiCommandExecApi } from "@nseng-ai/pi/shared/exec-gateway";
import { synthesizeThermoCouncilFinalReport } from "./final-synthesis.ts";
import { buildReviewerPrompt } from "./prompt.ts";
import {
	renderFatalReport,
	renderFinalSynthesisFailureReport,
	renderThermoCouncilReport,
} from "./report.ts";
import { collectThermoCouncilScope } from "./scope.ts";
import {
	toRunnerSubagentContext,
	type ThermoCouncilCommandContext,
	type ThermoCouncilExtensionAPI,
} from "./host-api.ts";
import type { ThermoCouncilRunContext } from "./run-context.ts";
import {
	parseThermoCouncilMaxConcurrency,
	parseThermoCouncilSeats,
	type EnvReader,
} from "./seats.ts";
import { seatLabels } from "./progress.ts";
import { reviewerOutcomeFromRunnerResult } from "./review-recovery.ts";

const STATUS_KEY = THERMO_COUNCIL_COMMAND_NAME;

interface LaunchThermoCouncilReviewerOptions extends ThermoCouncilRunContext {
	readonly seat: ThermoCouncilSeatConfig;
	readonly fleetRegistry: SubagentFleetRegistry;
	readonly onProgress?: (update: RunnerSubagentUpdate) => void;
}

interface LaunchThermoCouncilReviewerResult {
	readonly outcome: ThermoCouncilReviewerOutcome;
	readonly runnerResult: RunnerSubagentResult;
}

interface RunCouncilSeatsOptions extends ThermoCouncilRunContext {
	readonly seats: readonly ThermoCouncilSeatConfig[];
	readonly maxConcurrency: number;
	readonly fleetRegistry: SubagentFleetRegistry;
}

export interface RunThermoCouncilCommandOptions {
	readonly runtime?: SubagentRuntime;
	readonly fleetRegistry: SubagentFleetRegistry;
}

export async function runThermoCouncilCommand(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
	args: string,
	options: RunThermoCouncilCommandOptions,
): Promise<void> {
	setStatus(ctx, "preflighting review scope…");
	try {
		const reviewGuidance = normalizeReviewGuidance(args);
		const scopeResult = await collectThermoCouncilScope(createPiCommandExecApi(pi), ctx);
		if (scopeResult.type === "failed") {
			emitReport(pi, ctx, renderFatalReport(scopeResult.message));
			return;
		}

		const env = processEnvReader();
		const seats = parseThermoCouncilSeats(env);
		const maxConcurrency = parseThermoCouncilMaxConcurrency(env);
		const runtime = options.runtime ?? createSubprocessSubagentRuntime();
		const fleetRegistry = options.fleetRegistry;
		setStatus(ctx, `launching ${seats.length} council seats: ${seatLabels(seats)}…`);
		const outcomes = await runCouncilSeatsWithConcurrencyLimit({
			pi,
			ctx,
			runtime,
			fleetRegistry,
			scope: scopeResult.scope,
			seats,
			maxConcurrency,
			...(reviewGuidance === undefined ? {} : { reviewGuidance }),
		});
		setStatus(ctx, "aggregating thermo council findings…");
		const deterministicReport = renderThermoCouncilReport(scopeResult.scope, outcomes);
		if (!outcomes.some((outcome) => outcome.type === "completed")) {
			emitReport(pi, ctx, deterministicReport);
			return;
		}
		setStatus(ctx, "running final thermo council synthesis…");
		const synthesisResult = await synthesizeThermoCouncilFinalReport({
			pi,
			ctx,
			runtime,
			fleetRegistry,
			scope: scopeResult.scope,
			outcomes,
			deterministicReport,
			...(reviewGuidance === undefined ? {} : { reviewGuidance }),
		});
		const report =
			synthesisResult.type === "completed"
				? synthesisResult.report
				: renderFinalSynthesisFailureReport({
						scope: scopeResult.scope,
						outcomes,
						status: synthesisResult.status,
						diagnostic: synthesisResult.diagnostic,
						...(synthesisResult.sessionFile === undefined
							? {}
							: { sessionFile: synthesisResult.sessionFile }),
					});
		emitReport(pi, ctx, report);
	} catch (error) {
		emitReport(
			pi,
			ctx,
			renderFatalReport(`Unexpected /thermo-council failure: ${errorMessage(error)}`),
		);
	} finally {
		setStatus(ctx, undefined);
	}
}

async function launchThermoCouncilReviewer({
	pi,
	ctx,
	scope,
	seat,
	reviewGuidance,
	fleetRegistry,
	onProgress,
	runtime,
}: LaunchThermoCouncilReviewerOptions): Promise<LaunchThermoCouncilReviewerResult> {
	const runnerCtx = toRunnerSubagentContext(ctx);
	const prompt =
		reviewGuidance === undefined
			? buildReviewerPrompt(scope, seat)
			: buildReviewerPrompt(scope, seat, { reviewGuidance });
	const result = await runtime.dispatch({
		pi,
		ctx: runnerCtx,
		options: {
			title: `Thermo council: ${seat.label}`,
			model: seat.model,
			prompt,
			returnMode: "terminal",
			terminalTools: [submitThermoCouncilReviewTool, blockThermoCouncilReviewTool],
			tools: ["read", SUBMIT_THERMO_COUNCIL_REVIEW_TOOL, BLOCK_THERMO_COUNCIL_REVIEW_TOOL],
			...(onProgress === undefined ? {} : { onProgress }),
		},
	});
	return {
		outcome: await reviewerOutcomeFromRunnerResult(seat, result, {
			pi,
			ctx,
			runtime,
			fleetRegistry,
		}),
		runnerResult: result,
	};
}

async function runCouncilSeatsWithConcurrencyLimit({
	pi,
	ctx,
	scope,
	seats,
	maxConcurrency,
	runtime,
	fleetRegistry,
	reviewGuidance,
}: RunCouncilSeatsOptions): Promise<ThermoCouncilReviewerOutcome[]> {
	return await withFleetTracking({
		registry: fleetRegistry,
		ctx,
		tasks: seats.map((seat) => ({ title: `Thermo council: ${seat.label}` })),
		run: async (tracking) => {
			const outcomes = await mapWithConcurrency({
				items: seats.map((seat, index) => ({ seat, index })),
				maxConcurrency,
				run: async ({ seat, index }) => {
					tracking.markRunning(index);
					const result = await launchThermoCouncilReviewer({
						pi,
						ctx,
						runtime,
						fleetRegistry,
						scope,
						seat,
						...(reviewGuidance === undefined ? {} : { reviewGuidance }),
						onProgress: (update) => tracking.markProgress(index, update),
					});
					tracking.markDone(index, result.runnerResult);
					return result.outcome;
				},
			});
			return outcomes.map((outcome, index) => {
				if (outcome === undefined) {
					throw new Error(`Missing thermo-council outcome for seat index ${index}.`);
				}
				return outcome;
			});
		},
	});
}

async function withDisposal<T>(tracking: { dispose(): void }, run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} finally {
		tracking.dispose();
	}
}

async function withFleetTracking<T>(input: {
	readonly registry: SubagentFleetRegistry;
	readonly ctx: ThermoCouncilCommandContext;
	readonly tasks: readonly SubagentFleetTaskInput[];
	run(tracking: SubagentFleetRunTracking): Promise<T>;
}): Promise<T> {
	const tracking = trackSubagentFleetRun({
		registry: input.registry,
		ctx: input.ctx,
		tasks: input.tasks,
		parentSessionFile: undefined,
	});
	return await withDisposal(tracking, async () => await input.run(tracking));
}

function normalizeReviewGuidance(args: string): string | undefined {
	const trimmed = args.trim();
	return trimmed.length === 0 ? undefined : trimmed;
}

function emitReport(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
	reportMarkdown: string,
): void {
	if (pi.sendMessage !== undefined) {
		void pi.sendMessage({
			customType: THERMO_COUNCIL_MESSAGE_TYPE,
			content: reportMarkdown,
			display: true,
			details: { command: THERMO_COUNCIL_COMMAND_NAME },
		});
		return;
	}
	ctx.ui?.notify?.(reportMarkdown, "info");
}

function setStatus(ctx: ThermoCouncilCommandContext, value: string | undefined): void {
	ctx.ui?.setStatus?.(STATUS_KEY, value);
}

function processEnvReader(): EnvReader {
	return { get: (name) => process.env[name] };
}
