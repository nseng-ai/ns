import { z } from "zod";

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
	type JsonObject,
	type RunnerSubagentContext,
	type RunnerSubagentResult,
} from "../runner-subagent.ts";
import { THERMO_COUNCIL_COMMAND_NAME, THERMO_COUNCIL_MESSAGE_TYPE } from "./constants.ts";
import { buildReviewerPrompt } from "./prompt.ts";
import { renderFatalReport, renderThermoCouncilReport } from "./report.ts";
import { collectThermoCouncilScope } from "./scope.ts";
import { parseThermoCouncilSeats } from "./seats.ts";
import type { EnvReader, ThermoCouncilCommandContext, ThermoCouncilExtensionAPI } from "./types.ts";

const STATUS_KEY = THERMO_COUNCIL_COMMAND_NAME;

interface LaunchThermoCouncilReviewerOptions {
	readonly pi: ThermoCouncilExtensionAPI;
	readonly ctx: ThermoCouncilCommandContext;
	readonly scope: ThermoCouncilScope;
	readonly seat: ThermoCouncilSeatConfig;
}

export async function runThermoCouncilCommand(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
	args: string,
): Promise<void> {
	setStatus(ctx, "preflighting review scope…");
	try {
		const scopeResult = await collectThermoCouncilScope(pi, ctx, args);
		if (scopeResult.type === "failed") {
			emitReport(pi, ctx, renderFatalReport(scopeResult.message));
			return;
		}

		const seats = parseThermoCouncilSeats(processEnvReader());
		setStatus(ctx, `launching ${seats.length} council seats…`);
		const outcomes = await Promise.all(
			seats.map((seat) => launchThermoCouncilReviewer({ pi, ctx, scope: scopeResult.scope, seat })),
		);
		setStatus(ctx, "synthesizing thermo council report…");
		const report = renderThermoCouncilReport(scopeResult.scope, outcomes);
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
}: LaunchThermoCouncilReviewerOptions): Promise<ThermoCouncilReviewerOutcome> {
	const runnerCtx: RunnerSubagentContext = {
		cwd: ctx.cwd,
		...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
		...(ctx.model === undefined ? {} : { model: ctx.model }),
	};
	const result = await dispatchRunnerSubagent<JsonObject>(pi, runnerCtx, {
		title: `Thermo council: ${seat.label}`,
		model: seat.model,
		prompt: buildReviewerPrompt(scope, seat),
		returnMode: "terminal",
		terminalTools: [submitThermoCouncilReviewTool, blockThermoCouncilReviewTool],
		tools: ["read", SUBMIT_THERMO_COUNCIL_REVIEW_TOOL, BLOCK_THERMO_COUNCIL_REVIEW_TOOL],
	});
	return reviewerOutcomeFromRunnerResult(seat, result);
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
			return failedOutcome(seat, result.sessionFile, z.prettifyError(parsed.error));
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
			: `Blocked with malformed payload: ${z.prettifyError(parsed.error)}`;
		return {
			type: "blocked",
			seat,
			...(result.sessionFile === undefined ? {} : { sessionFile: result.sessionFile }),
			reason,
		};
	}

	return failedOutcome(seat, result.sessionFile, failureDiagnostic(result));
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

function failureDiagnostic(result: RunnerSubagentResult<JsonObject>): string {
	switch (result.status) {
		case "cancelled":
		case "error":
		case "protocol-error":
		case "stopped-without-terminal":
		case "stopped-without-useful-text":
			return result.diagnostic;
		case "final-text":
			return "Reviewer returned final text instead of terminal capture.";
		case "completed":
		case "blocked":
			return `Unexpected reviewer result status: ${result.status}.`;
	}
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
