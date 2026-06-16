import { readFile, stat } from "node:fs/promises";

import { negative, ok, type ClinkrExit, type LegacyMachineOutput } from "@asdl/clinkr";
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
import { legacyMachine } from "./legacy-machine.ts";

const runnerSubagentUsageStatusSchema = z.enum(["ok", "missing", "not_file", "invalid_json", "read_error", "no_usage"]);

export const runnerSubagentCostTotalsSchema = z.object({
	input_usd: z.number(),
	output_usd: z.number(),
	cache_read_usd: z.number(),
	cache_write_usd: z.number(),
	total_usd: z.number(),
});

export const runnerSubagentTokenTotalsSchema = z.object({
	input_tokens: z.number().int(),
	output_tokens: z.number().int(),
	cache_read_tokens: z.number().int(),
	cache_write_tokens: z.number().int(),
	total_tokens: z.number().int(),
});

export const runnerSubagentModelRefSchema = z.object({
	provider: z.string().nullable(),
	api: z.string().nullable(),
	model: z.string().nullable(),
});

export const runnerSubagentUsageSummarySchema = z.object({
	session_file: z.string(),
	status: runnerSubagentUsageStatusSchema,
	error: z.string().nullable(),
	error_line: z.number().int().nullable(),
	assistant_response_count: z.number().int(),
	models: z.array(runnerSubagentModelRefSchema),
	tokens: runnerSubagentTokenTotalsSchema,
	cost: runnerSubagentCostTotalsSchema,
	peak_observed_total_tokens: z.number().int().nullable(),
	peak_observed_prompt_tokens: z.number().int().nullable(),
	configured_context_window_tokens: z.number().int().nullable(),
});

export const runnerSubagentUsageAggregateSchema = z.object({
	session_count: z.number().int(),
	ok_session_count: z.number().int(),
	usage_response_count: z.number().int(),
	tokens: runnerSubagentTokenTotalsSchema,
	cost: runnerSubagentCostTotalsSchema,
	peak_observed_total_tokens: z.number().int().nullable(),
	peak_observed_prompt_tokens: z.number().int().nullable(),
	configured_context_window_tokens: z.number().int().nullable(),
});

export const runnerSubagentUsageResultSchema = z.object({
	sessions: z.array(runnerSubagentUsageSummarySchema),
	aggregate: runnerSubagentUsageAggregateSchema,
});

export const runnerSubagentUsageRequestSchema = z.object({
	session_files: z.array(z.string()).default([]).describe("Pi runner subagent JSONL session files."),
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
	const result = await summarizeRunnerSubagentUsage(request.session_files);
	if (request.session_files.length === 0) {
		return negative("Missing session file (missing_session_file). Pass at least one Pi runner subagent JSONL file.", result);
	}
	return ok(result);
}

export async function summarizeRunnerSubagentUsage(sessionFiles: readonly string[]): Promise<RunnerSubagentUsageResult> {
	const sessions = await Promise.all(sessionFiles.map((sessionFile) => summarizeRunnerSubagentSessionFile(sessionFile)));
	return {
		sessions,
		aggregate: buildAggregate(sessions),
	};
}

export async function summarizeRunnerSubagentSessionFile(sessionFile: string): Promise<RunnerSubagentUsageSummary> {
	let fileStat;
	try {
		fileStat = await stat(sessionFile);
	} catch (error) {
		const nodeError = error as NodeJS.ErrnoException;
		if (nodeError.code === "ENOENT") return emptySummary(sessionFile, { status: "missing", error: "session file does not exist" });
		return emptySummary(sessionFile, { status: "read_error", error: errorMessage(error) });
	}
	if (!fileStat.isFile()) return emptySummary(sessionFile, { status: "not_file", error: "path is not a file" });

	let content: string;
	try {
		content = await readFile(sessionFile, "utf8");
	} catch (error) {
		return emptySummary(sessionFile, { status: "read_error", error: errorMessage(error) });
	}

	const parsed = parseRunnerSubagentUsageJsonl(content);
	if (parsed.type === "invalid-json") {
		return emptySummary(sessionFile, { status: "invalid_json", error: `invalid JSON: ${parsed.message}`, errorLine: parsed.line });
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
		`- sessions: ${formatInt(result.aggregate.session_count)} total, ${formatInt(result.aggregate.ok_session_count)} with usage`,
		`- usage responses: ${formatInt(result.aggregate.usage_response_count)}`,
		`- tokens: ${formatInt(result.aggregate.tokens.input_tokens)} input / ${formatInt(result.aggregate.tokens.output_tokens)} output / ${formatInt(result.aggregate.tokens.cache_read_tokens)} cache read / ${formatInt(result.aggregate.tokens.cache_write_tokens)} cache write / ${formatInt(result.aggregate.tokens.total_tokens)} total`,
		`- peak observed total tokens: ${formatOptionalInt(result.aggregate.peak_observed_total_tokens)}`,
		`- peak observed prompt tokens: ${formatOptionalInt(result.aggregate.peak_observed_prompt_tokens)}`,
		`- configured context window: ${formatConfiguredContextWindow(result.aggregate.configured_context_window_tokens)}`,
		`- cost: ${formatCost(result.aggregate.cost.total_usd)}`,
	);
	return parts.join("\n");
}

export function legacyRunnerSubagentUsageMachine(exit: ClinkrExit<RunnerSubagentUsageResult>): LegacyMachineOutput {
	return legacyMachine(exit);
}

function summaryFromRecords(sessionFile: string, records: readonly RunnerSubagentUsageRecord[]): RunnerSubagentUsageSummary {
	if (records.length === 0) return emptySummary(sessionFile, { status: "no_usage", error: "no assistant usage records found" });

	let tokens = zeroRuntimeTokens();
	let cost = zeroRuntimeCost();
	let peakObservedTotalTokens: number | null = null;
	let peakObservedPromptTokens: number | null = null;
	const models: RunnerSubagentModelRef[] = [];
	const seenModelKeys = new Set<string>();

	for (const record of records) {
		tokens = addRunnerSubagentUsageTotals(tokens, record.tokens);
		cost = addRunnerSubagentUsageCostTotals(cost, record.cost);
		peakObservedTotalTokens = maxOptional(peakObservedTotalTokens, Math.trunc(record.peakTotalTokens));
		peakObservedPromptTokens = maxOptional(peakObservedPromptTokens, Math.trunc(record.peakPromptTokens));

		const modelKey = `${record.model.provider ?? ""}\u0000${record.model.api ?? ""}\u0000${record.model.model ?? ""}`;
		if ((record.model.provider !== null || record.model.api !== null || record.model.model !== null) && !seenModelKeys.has(modelKey)) {
			seenModelKeys.add(modelKey);
			models.push(record.model);
		}
	}

	return {
		session_file: sessionFile,
		status: "ok",
		error: null,
		error_line: null,
		assistant_response_count: records.length,
		models,
		tokens: objectiveTokens(tokens),
		cost: objectiveCost(cost),
		peak_observed_total_tokens: peakObservedTotalTokens,
		peak_observed_prompt_tokens: peakObservedPromptTokens,
		configured_context_window_tokens: null,
	};
}

function buildAggregate(sessions: readonly RunnerSubagentUsageSummary[]): RunnerSubagentUsageAggregate {
	let tokens = zeroTokens();
	let cost = zeroCost();
	let usageResponseCount = 0;
	let peakObservedTotalTokens: number | null = null;
	let peakObservedPromptTokens: number | null = null;

	for (const session of sessions) {
		if (session.status !== "ok") continue;
		tokens = addTokens(tokens, session.tokens);
		cost = addCost(cost, session.cost);
		usageResponseCount += session.assistant_response_count;
		peakObservedTotalTokens = maxOptional(peakObservedTotalTokens, session.peak_observed_total_tokens);
		peakObservedPromptTokens = maxOptional(peakObservedPromptTokens, session.peak_observed_prompt_tokens);
	}

	return {
		session_count: sessions.length,
		ok_session_count: sessions.filter((session) => session.status === "ok").length,
		usage_response_count: usageResponseCount,
		tokens,
		cost,
		peak_observed_total_tokens: peakObservedTotalTokens,
		peak_observed_prompt_tokens: peakObservedPromptTokens,
		configured_context_window_tokens: null,
	};
}

function emptySummary(
	sessionFile: string,
	options: { readonly status: RunnerSubagentUsageStatus; readonly error: string | null; readonly errorLine?: number | undefined },
): RunnerSubagentUsageSummary {
	return {
		session_file: sessionFile,
		status: options.status,
		error: options.error,
		error_line: options.errorLine ?? null,
		assistant_response_count: 0,
		models: [],
		tokens: zeroTokens(),
		cost: zeroCost(),
		peak_observed_total_tokens: null,
		peak_observed_prompt_tokens: null,
		configured_context_window_tokens: null,
	};
}

function zeroTokens(): RunnerSubagentTokenTotals {
	return objectiveTokens(zeroRuntimeTokens());
}

function zeroCost(): RunnerSubagentCostTotals {
	return objectiveCost(zeroRuntimeCost());
}

function zeroRuntimeTokens(): RuntimeRunnerSubagentUsageTotals {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
}

function zeroRuntimeCost(): RuntimeRunnerSubagentUsageCostTotals {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}

function objectiveTokens(tokens: RuntimeRunnerSubagentUsageTotals): RunnerSubagentTokenTotals {
	return {
		input_tokens: Math.trunc(tokens.input),
		output_tokens: Math.trunc(tokens.output),
		cache_read_tokens: Math.trunc(tokens.cacheRead),
		cache_write_tokens: Math.trunc(tokens.cacheWrite),
		total_tokens: Math.trunc(tokens.totalTokens),
	};
}

function objectiveCost(cost: RuntimeRunnerSubagentUsageCostTotals): RunnerSubagentCostTotals {
	return {
		input_usd: cost.input,
		output_usd: cost.output,
		cache_read_usd: cost.cacheRead,
		cache_write_usd: cost.cacheWrite,
		total_usd: cost.total,
	};
}

function addTokens(left: RunnerSubagentTokenTotals, right: RunnerSubagentTokenTotals): RunnerSubagentTokenTotals {
	return {
		input_tokens: left.input_tokens + right.input_tokens,
		output_tokens: left.output_tokens + right.output_tokens,
		cache_read_tokens: left.cache_read_tokens + right.cache_read_tokens,
		cache_write_tokens: left.cache_write_tokens + right.cache_write_tokens,
		total_tokens: left.total_tokens + right.total_tokens,
	};
}

function addCost(left: RunnerSubagentCostTotals, right: RunnerSubagentCostTotals): RunnerSubagentCostTotals {
	return {
		input_usd: left.input_usd + right.input_usd,
		output_usd: left.output_usd + right.output_usd,
		cache_read_usd: left.cache_read_usd + right.cache_read_usd,
		cache_write_usd: left.cache_write_usd + right.cache_write_usd,
		total_usd: left.total_usd + right.total_usd,
	};
}

function maxOptional(left: number | null, right: number | null): number | null {
	if (right === null) return left;
	if (left === null || right > left) return right;
	return left;
}

function renderSessionRow(session: RunnerSubagentUsageSummary): string {
	return `| ${markdownCell(session.session_file)} | ${markdownCell(statusText(session))} | ${formatInt(session.assistant_response_count)} | ${markdownCell(modelsText(session.models))} | ${formatSessionInt(session, session.tokens.input_tokens)} | ${formatSessionInt(session, session.tokens.output_tokens)} | ${formatSessionInt(session, session.tokens.cache_read_tokens)} | ${formatSessionInt(session, session.tokens.cache_write_tokens)} | ${formatSessionInt(session, session.tokens.total_tokens)} | ${formatSessionOptionalInt(session, session.peak_observed_total_tokens)} | ${formatSessionOptionalInt(session, session.peak_observed_prompt_tokens)} | ${formatSessionCost(session)} |`;
}

function statusText(session: RunnerSubagentUsageSummary): string {
	if (session.error === null) return session.status;
	if (session.error_line !== null) return `${session.status} (line ${session.error_line}: ${session.error})`;
	return `${session.status} (${session.error})`;
}

function modelsText(models: readonly RunnerSubagentModelRef[]): string {
	if (models.length === 0) return "—";
	return models.map(modelText).join(", ");
}

function modelText(modelRef: RunnerSubagentModelRef): string {
	const parts = [modelRef.provider, modelRef.api, modelRef.model].filter((part): part is string => part !== null && part !== "");
	return parts.length === 0 ? "—" : parts.join("/");
}

function formatSessionInt(session: RunnerSubagentUsageSummary, value: number): string {
	if (session.status !== "ok") return "—";
	return formatInt(value);
}

function formatSessionOptionalInt(session: RunnerSubagentUsageSummary, value: number | null): string {
	if (session.status !== "ok" || value === null) return "—";
	return formatInt(value);
}

function formatSessionCost(session: RunnerSubagentUsageSummary): string {
	if (session.status !== "ok") return "—";
	return formatCost(session.cost.total_usd);
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
