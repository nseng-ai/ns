import { readFile, stat } from "node:fs/promises";

import { negative, ok, type ClinkrExit } from "@asdl/clinkr";
import {
	addRunnerSubagentUsageCostTotals,
	addRunnerSubagentUsageTotals,
	parseRunnerSubagentUsageJsonl,
	type RunnerSubagentUsageCostTotals as RuntimeRunnerSubagentUsageCostTotals,
	type RunnerSubagentUsageRecord,
	type RunnerSubagentUsageTotals as RuntimeRunnerSubagentUsageTotals,
} from "@asdl/pi-extension-runtime/runner-subagent-usage";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";

const runnerSubagentUsageStatusSchema = z.enum([
	"ok",
	"missing",
	"not_file",
	"invalid_json",
	"read_error",
	"no_usage",
]);

export const runnerSubagentCostTotalsSchema = z.object({
	inputUsd: z.number(),
	outputUsd: z.number(),
	cacheReadUsd: z.number(),
	cacheWriteUsd: z.number(),
	totalUsd: z.number(),
});

export const runnerSubagentTokenTotalsSchema = z.object({
	inputTokens: z.number().int(),
	outputTokens: z.number().int(),
	cacheReadTokens: z.number().int(),
	cacheWriteTokens: z.number().int(),
	totalTokens: z.number().int(),
});

export const runnerSubagentModelRefSchema = z.object({
	provider: z.string().nullable(),
	api: z.string().nullable(),
	model: z.string().nullable(),
});

export const runnerSubagentUsageSummarySchema = z.object({
	sessionFile: z.string(),
	status: runnerSubagentUsageStatusSchema,
	error: z.string().nullable(),
	errorLine: z.number().int().nullable(),
	assistantResponseCount: z.number().int(),
	models: z.array(runnerSubagentModelRefSchema),
	tokens: runnerSubagentTokenTotalsSchema,
	cost: runnerSubagentCostTotalsSchema,
	peakObservedTotalTokens: z.number().int().nullable(),
	peakObservedPromptTokens: z.number().int().nullable(),
	configuredContextWindowTokens: z.number().int().nullable(),
});

export const runnerSubagentUsageAggregateSchema = z.object({
	sessionCount: z.number().int(),
	okSessionCount: z.number().int(),
	usageResponseCount: z.number().int(),
	tokens: runnerSubagentTokenTotalsSchema,
	cost: runnerSubagentCostTotalsSchema,
	peakObservedTotalTokens: z.number().int().nullable(),
	peakObservedPromptTokens: z.number().int().nullable(),
	configuredContextWindowTokens: z.number().int().nullable(),
});

export const runnerSubagentUsageResultSchema = z.object({
	sessions: z.array(runnerSubagentUsageSummarySchema),
	aggregate: runnerSubagentUsageAggregateSchema,
});

export const runnerSubagentUsageRequestSchema = z.object({
	sessionFiles: z.array(z.string()).default([]).describe("Pi runner subagent JSONL session files."),
});

export type RunnerSubagentUsageStatus = z.infer<typeof runnerSubagentUsageStatusSchema>;
export type RunnerSubagentCostTotals = z.infer<typeof runnerSubagentCostTotalsSchema>;
export type RunnerSubagentTokenTotals = z.infer<typeof runnerSubagentTokenTotalsSchema>;
export type RunnerSubagentModelRef = z.infer<typeof runnerSubagentModelRefSchema>;
export type RunnerSubagentUsageSummary = z.infer<typeof runnerSubagentUsageSummarySchema>;
export type RunnerSubagentUsageAggregate = z.infer<typeof runnerSubagentUsageAggregateSchema>;
export type RunnerSubagentUsageResult = z.infer<typeof runnerSubagentUsageResultSchema>;
export type RunnerSubagentUsageRequest = z.infer<typeof runnerSubagentUsageRequestSchema>;

export async function runRunnerSubagentUsage(
	_ctx: ObjectiveCliContext,
	request: RunnerSubagentUsageRequest,
): Promise<ClinkrExit<RunnerSubagentUsageResult>> {
	const result = await summarizeRunnerSubagentUsage(request.sessionFiles);
	if (request.sessionFiles.length === 0) {
		return negative(
			"Missing session file (missing_session_file). Pass at least one Pi runner subagent JSONL file.",
			result,
		);
	}
	return ok(result);
}

export async function summarizeRunnerSubagentUsage(
	sessionFiles: readonly string[],
): Promise<RunnerSubagentUsageResult> {
	const sessions = await Promise.all(
		sessionFiles.map((sessionFile) => summarizeRunnerSubagentSessionFile(sessionFile)),
	);
	return {
		sessions,
		aggregate: buildAggregate(sessions),
	};
}

export async function summarizeRunnerSubagentSessionFile(
	sessionFile: string,
): Promise<RunnerSubagentUsageSummary> {
	let fileStat;
	try {
		fileStat = await stat(sessionFile);
	} catch (error) {
		const nodeError = error as NodeJS.ErrnoException;
		if (nodeError.code === "ENOENT")
			return emptySummary(sessionFile, { status: "missing", error: "session file does not exist" });
		return emptySummary(sessionFile, { status: "read_error", error: errorMessage(error) });
	}
	if (!fileStat.isFile())
		return emptySummary(sessionFile, { status: "not_file", error: "path is not a file" });

	let content: string;
	try {
		content = await readFile(sessionFile, "utf8");
	} catch (error) {
		return emptySummary(sessionFile, { status: "read_error", error: errorMessage(error) });
	}

	const parsed = parseRunnerSubagentUsageJsonl(content);
	if (parsed.type === "invalid-json") {
		return emptySummary(sessionFile, {
			status: "invalid_json",
			error: `invalid JSON: ${parsed.message}`,
			errorLine: parsed.line,
		});
	}

	return summaryFromRecords(sessionFile, parsed.records);
}

export function renderRunnerSubagentUsageMarkdown(result: RunnerSubagentUsageResult): string {
	const parts = [
		"# Runner Subagent Usage",
		"",
		"| session | status | responses | model(s) | input | output | cache read | cache write | total tokens | peak total | peak prompt | cost |",
		"| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
	];
	for (const session of result.sessions) parts.push(renderSessionRow(session));
	parts.push(
		"",
		"## Aggregate",
		"",
		`- sessions: ${formatInt(result.aggregate.sessionCount)} total, ${formatInt(result.aggregate.okSessionCount)} with usage`,
		`- usage responses: ${formatInt(result.aggregate.usageResponseCount)}`,
		`- tokens: ${formatInt(result.aggregate.tokens.inputTokens)} input / ${formatInt(result.aggregate.tokens.outputTokens)} output / ${formatInt(result.aggregate.tokens.cacheReadTokens)} cache read / ${formatInt(result.aggregate.tokens.cacheWriteTokens)} cache write / ${formatInt(result.aggregate.tokens.totalTokens)} total`,
		`- peak observed total tokens: ${formatOptionalInt(result.aggregate.peakObservedTotalTokens)}`,
		`- peak observed prompt tokens: ${formatOptionalInt(result.aggregate.peakObservedPromptTokens)}`,
		`- configured context window: ${formatConfiguredContextWindow(result.aggregate.configuredContextWindowTokens)}`,
		`- cost: ${formatCost(result.aggregate.cost.totalUsd)}`,
	);
	return parts.join("\n");
}

function summaryFromRecords(
	sessionFile: string,
	records: readonly RunnerSubagentUsageRecord[],
): RunnerSubagentUsageSummary {
	if (records.length === 0)
		return emptySummary(sessionFile, {
			status: "no_usage",
			error: "no assistant usage records found",
		});

	let tokens = zeroRuntimeTokens();
	let cost = zeroRuntimeCost();
	let peakObservedTotalTokens: number | null = null;
	let peakObservedPromptTokens: number | null = null;
	const models: RunnerSubagentModelRef[] = [];
	const seenModelKeys = new Set<string>();

	for (const record of records) {
		tokens = addRunnerSubagentUsageTotals(tokens, record.tokens);
		cost = addRunnerSubagentUsageCostTotals(cost, record.cost);
		peakObservedTotalTokens = maxOptional(
			peakObservedTotalTokens,
			Math.trunc(record.peakTotalTokens),
		);
		peakObservedPromptTokens = maxOptional(
			peakObservedPromptTokens,
			Math.trunc(record.peakPromptTokens),
		);

		const modelKey = `${record.model.provider ?? ""}\u0000${record.model.api ?? ""}\u0000${record.model.model ?? ""}`;
		if (
			(record.model.provider !== null ||
				record.model.api !== null ||
				record.model.model !== null) &&
			!seenModelKeys.has(modelKey)
		) {
			seenModelKeys.add(modelKey);
			models.push(record.model);
		}
	}

	return {
		sessionFile,
		status: "ok",
		error: null,
		errorLine: null,
		assistantResponseCount: records.length,
		models,
		tokens: objectiveTokens(tokens),
		cost: objectiveCost(cost),
		peakObservedTotalTokens,
		peakObservedPromptTokens,
		configuredContextWindowTokens: null,
	};
}

function buildAggregate(
	sessions: readonly RunnerSubagentUsageSummary[],
): RunnerSubagentUsageAggregate {
	let tokens = zeroObjectiveTokens();
	let cost = zeroObjectiveCost();
	let usageResponseCount = 0;
	let peakObservedTotalTokens: number | null = null;
	let peakObservedPromptTokens: number | null = null;

	for (const session of sessions) {
		if (session.status !== "ok") continue;
		tokens = addObjectiveTokens(tokens, session.tokens);
		cost = addObjectiveCost(cost, session.cost);
		usageResponseCount += session.assistantResponseCount;
		peakObservedTotalTokens = maxOptional(peakObservedTotalTokens, session.peakObservedTotalTokens);
		peakObservedPromptTokens = maxOptional(
			peakObservedPromptTokens,
			session.peakObservedPromptTokens,
		);
	}

	return {
		sessionCount: sessions.length,
		okSessionCount: sessions.filter((session) => session.status === "ok").length,
		usageResponseCount,
		tokens,
		cost,
		peakObservedTotalTokens,
		peakObservedPromptTokens,
		configuredContextWindowTokens: null,
	};
}

function emptySummary(
	sessionFile: string,
	options: {
		readonly status: RunnerSubagentUsageStatus;
		readonly error: string | null;
		readonly errorLine?: number | undefined;
	},
): RunnerSubagentUsageSummary {
	return {
		sessionFile,
		status: options.status,
		error: options.error,
		errorLine: options.errorLine ?? null,
		assistantResponseCount: 0,
		models: [],
		tokens: objectiveTokens(zeroRuntimeTokens()),
		cost: objectiveCost(zeroRuntimeCost()),
		peakObservedTotalTokens: null,
		peakObservedPromptTokens: null,
		configuredContextWindowTokens: null,
	};
}

function zeroRuntimeTokens(): RuntimeRunnerSubagentUsageTotals {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
}

function zeroRuntimeCost(): RuntimeRunnerSubagentUsageCostTotals {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}

function zeroObjectiveTokens(): RunnerSubagentTokenTotals {
	return {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		totalTokens: 0,
	};
}

function zeroObjectiveCost(): RunnerSubagentCostTotals {
	return { inputUsd: 0, outputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, totalUsd: 0 };
}

function addObjectiveTokens(
	left: RunnerSubagentTokenTotals,
	right: RunnerSubagentTokenTotals,
): RunnerSubagentTokenTotals {
	return {
		inputTokens: left.inputTokens + right.inputTokens,
		outputTokens: left.outputTokens + right.outputTokens,
		cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
		cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
		totalTokens: left.totalTokens + right.totalTokens,
	};
}

function addObjectiveCost(
	left: RunnerSubagentCostTotals,
	right: RunnerSubagentCostTotals,
): RunnerSubagentCostTotals {
	return {
		inputUsd: left.inputUsd + right.inputUsd,
		outputUsd: left.outputUsd + right.outputUsd,
		cacheReadUsd: left.cacheReadUsd + right.cacheReadUsd,
		cacheWriteUsd: left.cacheWriteUsd + right.cacheWriteUsd,
		totalUsd: left.totalUsd + right.totalUsd,
	};
}

function objectiveTokens(tokens: RuntimeRunnerSubagentUsageTotals): RunnerSubagentTokenTotals {
	return {
		inputTokens: Math.trunc(tokens.input),
		outputTokens: Math.trunc(tokens.output),
		cacheReadTokens: Math.trunc(tokens.cacheRead),
		cacheWriteTokens: Math.trunc(tokens.cacheWrite),
		totalTokens: Math.trunc(tokens.totalTokens),
	};
}

function objectiveCost(cost: RuntimeRunnerSubagentUsageCostTotals): RunnerSubagentCostTotals {
	return {
		inputUsd: cost.input,
		outputUsd: cost.output,
		cacheReadUsd: cost.cacheRead,
		cacheWriteUsd: cost.cacheWrite,
		totalUsd: cost.total,
	};
}

function maxOptional(left: number | null, right: number | null): number | null {
	if (right === null) return left;
	if (left === null || right > left) return right;
	return left;
}

function renderSessionRow(session: RunnerSubagentUsageSummary): string {
	return `| ${markdownCell(session.sessionFile)} | ${markdownCell(statusText(session))} | ${formatInt(session.assistantResponseCount)} | ${markdownCell(modelsText(session.models))} | ${formatSessionInt(session, session.tokens.inputTokens)} | ${formatSessionInt(session, session.tokens.outputTokens)} | ${formatSessionInt(session, session.tokens.cacheReadTokens)} | ${formatSessionInt(session, session.tokens.cacheWriteTokens)} | ${formatSessionInt(session, session.tokens.totalTokens)} | ${formatSessionOptionalInt(session, session.peakObservedTotalTokens)} | ${formatSessionOptionalInt(session, session.peakObservedPromptTokens)} | ${formatSessionCost(session)} |`;
}

function statusText(session: RunnerSubagentUsageSummary): string {
	if (session.error === null) return session.status;
	if (session.errorLine !== null)
		return `${session.status} (line ${session.errorLine}: ${session.error})`;
	return `${session.status} (${session.error})`;
}

function modelsText(models: readonly RunnerSubagentModelRef[]): string {
	if (models.length === 0) return "—";
	return models.map(modelText).join(", ");
}

function modelText(modelRef: RunnerSubagentModelRef): string {
	const parts = [modelRef.provider, modelRef.api, modelRef.model].filter(
		(part): part is string => part !== null && part !== "",
	);
	return parts.length === 0 ? "—" : parts.join("/");
}

function formatSessionInt(session: RunnerSubagentUsageSummary, value: number): string {
	if (session.status !== "ok") return "—";
	return formatInt(value);
}

function formatSessionOptionalInt(
	session: RunnerSubagentUsageSummary,
	value: number | null,
): string {
	if (session.status !== "ok" || value === null) return "—";
	return formatInt(value);
}

function formatSessionCost(session: RunnerSubagentUsageSummary): string {
	if (session.status !== "ok") return "—";
	return formatCost(session.cost.totalUsd);
}

function formatOptionalInt(value: number | null): string {
	if (value === null) return "unavailable";
	return formatInt(value);
}

function formatInt(value: number): string {
	return value.toLocaleString("en-US");
}

function formatCost(value: number): string {
	return `$${value.toFixed(6)}`;
}

function formatConfiguredContextWindow(value: number | null): string {
	if (value === null) return "unavailable in runner subagent logs";
	return `${formatInt(value)} tokens`;
}

function markdownCell(value: string): string {
	return value.replaceAll("\n", " ").replaceAll("|", "\\|");
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
