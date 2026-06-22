import type { z } from "zod";

import { formatZodError } from "@sdl/core/primitives";

import {
	BLOCK_THERMO_COUNCIL_REVIEW_TOOL,
	SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
	blockThermoCouncilReviewTool,
	blockedReviewSchema,
	reviewSchema,
	submitThermoCouncilReviewTool,
	type ThermoCouncilReview,
	type ThermoCouncilReviewerOutcome,
	type ThermoCouncilScope,
	type ThermoCouncilSeatConfig,
} from "../thermo-council-contract.ts";
import {
	dispatchRunnerSubagent,
	resultDiagnostic,
	runnerSubagentPrimaryActivityPreview,
	type JsonObject,
	type RunnerSubagentContext,
	type RunnerSubagentResult,
	type RunnerSubagentUpdate,
} from "../runner-subagent.ts";
import { THERMO_COUNCIL_COMMAND_NAME, THERMO_COUNCIL_MESSAGE_TYPE } from "./constants.ts";
import { synthesizeThermoCouncilFinalReport } from "./final-synthesis.ts";
import { buildReviewerPrompt } from "./prompt.ts";
import {
	renderFatalReport,
	renderFinalSynthesisFailureReport,
	renderThermoCouncilReport,
} from "./report.ts";
import { collectThermoCouncilScope } from "./scope.ts";
import { parseThermoCouncilSeats } from "./seats.ts";
import type { EnvReader, ThermoCouncilCommandContext, ThermoCouncilExtensionAPI } from "./types.ts";

const STATUS_KEY = THERMO_COUNCIL_COMMAND_NAME;

interface LaunchThermoCouncilReviewerOptions {
	readonly pi: ThermoCouncilExtensionAPI;
	readonly ctx: ThermoCouncilCommandContext;
	readonly scope: ThermoCouncilScope;
	readonly seat: ThermoCouncilSeatConfig;
	readonly reviewGuidance?: string;
	readonly onProgress?: (update: RunnerSubagentUpdate) => void;
}

interface CouncilSeatRunState {
	readonly seat: ThermoCouncilSeatConfig;
	readonly update?: RunnerSubagentUpdate;
	readonly outcome?: ThermoCouncilReviewerOutcome;
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

		const seats = parseThermoCouncilSeats(processEnvReader());
		const progressTracker = createCouncilProgressTracker(ctx, seats);
		setStatus(ctx, `launching ${seats.length} council seats: ${seatLabels(seats)}…`);
		const outcomes = await Promise.all(
			seats.map(async (seat) => {
				const outcome = await launchThermoCouncilReviewer({
					pi,
					ctx,
					scope: scopeResult.scope,
					seat,
					...(reviewGuidance === undefined ? {} : { reviewGuidance }),
					onProgress: (update) => progressTracker.recordProgress(seat, update),
				});
				progressTracker.recordOutcome(seat, outcome);
				return outcome;
			}),
		);
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
	const runnerCtx: RunnerSubagentContext = {
		cwd: ctx.cwd,
		...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
		...(ctx.model === undefined ? {} : { model: ctx.model }),
	};
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
	return reviewerOutcomeFromRunnerResult(seat, result);
}

function createCouncilProgressTracker(
	ctx: ThermoCouncilCommandContext,
	seats: readonly ThermoCouncilSeatConfig[],
): {
	recordProgress(seat: ThermoCouncilSeatConfig, update: RunnerSubagentUpdate): void;
	recordOutcome(seat: ThermoCouncilSeatConfig, outcome: ThermoCouncilReviewerOutcome): void;
} {
	const states = new Map<ThermoCouncilSeatConfig["id"], CouncilSeatRunState>(
		seats.map((seat) => [seat.id, { seat }]),
	);
	return {
		recordProgress(seat, update) {
			const current = states.get(seat.id) ?? { seat };
			states.set(seat.id, { ...current, update });
			setStatus(ctx, renderCouncilProgressStatus(seats, states));
		},
		recordOutcome(seat, outcome) {
			const current = states.get(seat.id) ?? { seat };
			states.set(seat.id, { ...current, outcome });
			setStatus(ctx, renderCouncilProgressStatus(seats, states));
		},
	};
}

function renderCouncilProgressStatus(
	seats: readonly ThermoCouncilSeatConfig[],
	states: ReadonlyMap<ThermoCouncilSeatConfig["id"], CouncilSeatRunState>,
): string {
	const completed = seats.filter((seat) => states.get(seat.id)?.outcome !== undefined).length;
	const summaries = seats.map((seat) => renderCouncilSeatProgress(states.get(seat.id) ?? { seat }));
	return compactStatus(`council ${completed}/${seats.length} done · ${summaries.join(" · ")}`);
}

function renderCouncilSeatProgress(state: CouncilSeatRunState): string {
	if (state.outcome !== undefined) return renderCouncilSeatOutcome(state.outcome);
	const progress = state.update?.progress;
	if (progress === undefined) return `${state.seat.label} queued`;
	const activity = state.update?.activity;
	const preview =
		activity === undefined ? undefined : runnerSubagentPrimaryActivityPreview(activity);
	if (preview !== undefined) return `${state.seat.label} ${progress.state}: ${preview}`;
	if (progress.currentTool !== undefined)
		return `${state.seat.label} ${progress.state} ${progress.currentTool}`;
	if (progress.turnCount > 0)
		return `${state.seat.label} ${progress.state} turn ${progress.turnCount}`;
	return `${state.seat.label} ${progress.state}`;
}

function renderCouncilSeatOutcome(outcome: ThermoCouncilReviewerOutcome): string {
	switch (outcome.type) {
		case "completed":
			return `${outcome.seat.label} completed (${outcome.review.findings.length} findings)`;
		case "blocked":
			return `${outcome.seat.label} blocked`;
		case "failed":
			return `${outcome.seat.label} failed`;
	}
}

function renderFinalSynthesisStatus(update: RunnerSubagentUpdate): string {
	const progress = update.progress;
	const preview = runnerSubagentPrimaryActivityPreview(update.activity);
	if (preview !== undefined) return compactStatus(`final synthesis ${progress.state}: ${preview}`);
	if (progress.turnCount > 0) return `final synthesis ${progress.state} turn ${progress.turnCount}`;
	return `final synthesis ${progress.state}`;
}

function normalizeReviewGuidance(args: string): string | undefined {
	const trimmed = args.trim();
	return trimmed.length === 0 ? undefined : trimmed;
}

function compactStatus(value: string): string {
	const limit = 240;
	if (value.length <= limit) return value;
	return `${value.slice(0, limit - 1)}…`;
}

function seatLabels(seats: readonly ThermoCouncilSeatConfig[]): string {
	return seats.map((seat) => seat.label).join(", ");
}

export function reviewerOutcomeFromRunnerResult(
	seat: ThermoCouncilSeatConfig,
	result: RunnerSubagentResult<JsonObject>,
): ThermoCouncilReviewerOutcome {
	if (result.status === "completed") {
		if (result.terminal.toolName !== SUBMIT_THERMO_COUNCIL_REVIEW_TOOL) {
			return failedOutcome(
				seat,
				result.sessionFile,
				`Unexpected terminal tool: ${result.terminal.toolName}`,
			);
		}
		const parsed = reviewSchema.safeParse(result.terminal.input);
		if (!parsed.success) {
			return failedOutcome(seat, result.sessionFile, formatZodError(parsed.error));
		}
		return {
			type: "completed",
			seat,
			...(result.sessionFile === undefined ? {} : { sessionFile: result.sessionFile }),
			review: normalizeReview(parsed.data),
		};
	}

	if (result.status === "blocked") {
		const parsed = blockedReviewSchema.safeParse(result.terminal.input);
		const reason = parsed.success
			? formatBlockedReason(parsed.data)
			: `Blocked with malformed payload: ${formatZodError(parsed.error)}`;
		return {
			type: "blocked",
			seat,
			...(result.sessionFile === undefined ? {} : { sessionFile: result.sessionFile }),
			reason,
		};
	}

	return failedOutcome(seat, result.sessionFile, reviewerFailureDiagnostic(result));
}

function failedOutcome(
	seat: ThermoCouncilSeatConfig,
	sessionFile: string | undefined,
	diagnostic: string,
): ThermoCouncilReviewerOutcome {
	return {
		type: "failed",
		seat,
		...(sessionFile === undefined ? {} : { sessionFile }),
		diagnostic,
	};
}

function reviewerFailureDiagnostic(result: RunnerSubagentResult<JsonObject>): string {
	if (result.status === "final-text")
		return "Reviewer returned final text instead of terminal capture.";
	return resultDiagnostic(result) ?? `Unexpected reviewer result status: ${result.status}.`;
}

function normalizeReview(data: z.infer<typeof reviewSchema>): ThermoCouncilReview {
	return {
		...(data.summary === undefined ? {} : { summary: data.summary }),
		findings: data.findings,
		...(data.disagreements.length === 0 ? {} : { disagreements: data.disagreements }),
	};
}

function formatBlockedReason(data: z.infer<typeof blockedReviewSchema>): string {
	return [
		data.reason,
		...(data.missingContext.length === 0
			? []
			: [`missing context: ${data.missingContext.join(", ")}`]),
		...(data.suggestedRecovery === undefined || data.suggestedRecovery === ""
			? []
			: [`recovery: ${data.suggestedRecovery}`]),
	].join("; ");
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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
