import {
	BLOCK_THERMO_COUNCIL_REVIEW_TOOL,
	SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
	THERMO_COUNCIL_COMMAND_NAME,
	THERMO_COUNCIL_MESSAGE_TYPE,
	blockThermoCouncilReviewTool,
	submitThermoCouncilReviewTool,
	type ThermoCouncilReviewerOutcome,
	type ThermoCouncilScope,
	type ThermoCouncilSeatConfig,
} from "./contract.ts";
import {
	dispatchRunnerSubagent,
	mapWithConcurrency,
	type JsonObject,
	type RunnerSubagentUpdate,
} from "@internal/pi-tools/runner-subagents";
import { errorMessage } from "@nseng-ai/pi/shared/errors";
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
import {
	parseThermoCouncilMaxConcurrency,
	parseThermoCouncilSeats,
	type EnvReader,
} from "./seats.ts";
import {
	createCouncilProgressTracker,
	renderFinalSynthesisStatus,
	seatLabels,
	type CouncilProgressTracker,
} from "./progress.ts";
import { reviewerOutcomeFromRunnerResult } from "./review-recovery.ts";

const STATUS_KEY = THERMO_COUNCIL_COMMAND_NAME;
interface LaunchThermoCouncilReviewerOptions {
	readonly pi: ThermoCouncilExtensionAPI;
	readonly ctx: ThermoCouncilCommandContext;
	readonly scope: ThermoCouncilScope;
	readonly seat: ThermoCouncilSeatConfig;
	readonly reviewGuidance?: string;
	readonly onProgress?: (update: RunnerSubagentUpdate) => void;
}

interface RunCouncilSeatsOptions {
	readonly pi: ThermoCouncilExtensionAPI;
	readonly ctx: ThermoCouncilCommandContext;
	readonly scope: ThermoCouncilScope;
	readonly seats: readonly ThermoCouncilSeatConfig[];
	readonly maxConcurrency: number;
	readonly progressTracker: CouncilProgressTracker;
	readonly reviewGuidance?: string;
}

export async function runThermoCouncilCommand(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
	args: string,
): Promise<void> {
	setStatus(ctx, "preflighting review scope…");
	try {
		const reviewGuidance = normalizeReviewGuidance(args);
		const scopeResult = await collectThermoCouncilScope(pi, ctx);
		if (scopeResult.type === "failed") {
			emitReport(pi, ctx, renderFatalReport(scopeResult.message));
			return;
		}

		const env = processEnvReader();
		const seats = parseThermoCouncilSeats(env);
		const maxConcurrency = parseThermoCouncilMaxConcurrency(env);
		const progressTracker = createCouncilProgressTracker({
			seats,
			onStatus: (value) => setStatus(ctx, value),
		});
		setStatus(ctx, `launching ${seats.length} council seats: ${seatLabels(seats)}…`);
		const outcomes = await runCouncilSeatsWithConcurrencyLimit({
			pi,
			ctx,
			scope: scopeResult.scope,
			seats,
			maxConcurrency,
			progressTracker,
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
			scope: scopeResult.scope,
			outcomes,
			deterministicReport,
			...(reviewGuidance === undefined ? {} : { reviewGuidance }),
			onProgress: (update) => setStatus(ctx, renderFinalSynthesisStatus(update)),
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
	onProgress,
}: LaunchThermoCouncilReviewerOptions): Promise<ThermoCouncilReviewerOutcome> {
	const runnerCtx = toRunnerSubagentContext(ctx);
	const prompt =
		reviewGuidance === undefined
			? buildReviewerPrompt(scope, seat)
			: buildReviewerPrompt(scope, seat, { reviewGuidance });
	const result = await dispatchRunnerSubagent<JsonObject>(pi, runnerCtx, {
		title: `Thermo council: ${seat.label}`,
		model: seat.model,
		prompt,
		returnMode: "terminal",
		terminalTools: [submitThermoCouncilReviewTool, blockThermoCouncilReviewTool],
		tools: ["read", SUBMIT_THERMO_COUNCIL_REVIEW_TOOL, BLOCK_THERMO_COUNCIL_REVIEW_TOOL],
		...(onProgress === undefined ? {} : { onProgress }),
	});
	return await reviewerOutcomeFromRunnerResult(seat, result, { pi, ctx });
}

async function runCouncilSeatsWithConcurrencyLimit({
	pi,
	ctx,
	scope,
	seats,
	maxConcurrency,
	progressTracker,
	reviewGuidance,
}: RunCouncilSeatsOptions): Promise<ThermoCouncilReviewerOutcome[]> {
	const outcomes = await mapWithConcurrency({
		items: seats,
		maxConcurrency,
		run: async (seat) => {
			const outcome = await launchThermoCouncilReviewer({
				pi,
				ctx,
				scope,
				seat,
				...(reviewGuidance === undefined ? {} : { reviewGuidance }),
				onProgress: (update) => progressTracker.recordProgress(seat, update),
			});
			progressTracker.recordOutcome(seat, outcome);
			return outcome;
		},
	});
	return outcomes.map((outcome, index) => {
		if (outcome === undefined) {
			throw new Error(`Missing thermo-council outcome for seat index ${index}.`);
		}
		return outcome;
	});
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
