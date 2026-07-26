import { finiteNumberField, isRecord, optionalEntry } from "../primitives/primitives.ts";

export interface RuntimeRunnerSubagentUsageTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
}

export interface RuntimeRunnerSubagentUsageCostTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	total: number;
}

export interface RunnerSubagentUsageModelRef {
	provider: string | null;
	api: string | null;
	model: string | null;
}

export interface RunnerSubagentUsageRecord {
	tokens: RuntimeRunnerSubagentUsageTotals;
	cost: RuntimeRunnerSubagentUsageCostTotals;
	model: RunnerSubagentUsageModelRef;
	peakTotalTokens: number;
	peakPromptTokens: number;
	contextWindow?: number;
}

export type ParseRunnerSubagentUsageJsonlResult =
	| { type: "ok"; records: readonly RunnerSubagentUsageRecord[] }
	| { type: "invalid-json"; line: number; message: string };

type JsonRecord = Record<string, unknown>;

interface FieldSearchOptions<T> {
	record: JsonRecord;
	message: JsonRecord;
	usage: JsonRecord;
	keys: readonly string[];
	extract(data: JsonRecord, key: string): T | undefined;
}

const TOKEN_FIELDS = ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const;

export function parseRunnerSubagentUsageJsonl(jsonl: string): ParseRunnerSubagentUsageJsonlResult {
	const records: RunnerSubagentUsageRecord[] = [];
	const lines = jsonl.split(/\r?\n/u);
	for (const [index, rawLine] of lines.entries()) {
		const line = rawLine.trim();
		if (line === "") continue;

		let parsed: unknown;
		try {
			parsed = JSON.parse(line) as unknown;
		} catch (error) {
			return { type: "invalid-json", line: index + 1, message: jsonParseErrorMessage(error) };
		}

		const usage = usageFromRecord(parsed);
		if (usage === null) continue;
		records.push(usage);
	}
	return { type: "ok", records };
}

export function addRuntimeRunnerSubagentUsageTotals(
	left: RuntimeRunnerSubagentUsageTotals,
	right: RuntimeRunnerSubagentUsageTotals,
): RuntimeRunnerSubagentUsageTotals {
	return {
		input: left.input + right.input,
		output: left.output + right.output,
		cacheRead: left.cacheRead + right.cacheRead,
		cacheWrite: left.cacheWrite + right.cacheWrite,
		totalTokens: left.totalTokens + right.totalTokens,
	};
}

export function addRuntimeRunnerSubagentUsageCostTotals(
	left: RuntimeRunnerSubagentUsageCostTotals,
	right: RuntimeRunnerSubagentUsageCostTotals,
): RuntimeRunnerSubagentUsageCostTotals {
	return {
		input: left.input + right.input,
		output: left.output + right.output,
		cacheRead: left.cacheRead + right.cacheRead,
		cacheWrite: left.cacheWrite + right.cacheWrite,
		total: left.total + right.total,
	};
}

function usageFromRecord(record: unknown): RunnerSubagentUsageRecord | null {
	if (!isRecord(record)) return null;
	if (record.type !== undefined && record.type !== "message") return null;

	const message = mappingField(record, "message");
	if (message === null || message.role !== "assistant") return null;

	const usage = mappingField(message, "usage");
	if (usage === null || !hasUsableTokenUsage(usage)) return null;

	const tokens = tokensFromUsage(usage);
	const contextWindow = contextWindowFromRecord(record, message, usage);
	return {
		tokens,
		cost: costFromUsage(usage),
		model: modelRefFromRecord(record, message, usage),
		peakTotalTokens: tokens.totalTokens,
		peakPromptTokens: tokens.input + tokens.cacheRead + tokens.cacheWrite,
		...optionalEntry("contextWindow", contextWindow),
	};
}

function tokensFromUsage(usage: JsonRecord): RuntimeRunnerSubagentUsageTotals {
	return {
		input: numberField(usage, "input"),
		output: numberField(usage, "output"),
		cacheRead: numberField(usage, "cacheRead"),
		cacheWrite: numberField(usage, "cacheWrite"),
		totalTokens: numberField(usage, "totalTokens"),
	};
}

function costFromUsage(usage: JsonRecord): RuntimeRunnerSubagentUsageCostTotals {
	const cost = mappingField(usage, "cost") ?? {};
	return {
		input: numberField(cost, "input"),
		output: numberField(cost, "output"),
		cacheRead: numberField(cost, "cacheRead"),
		cacheWrite: numberField(cost, "cacheWrite"),
		total: numberField(cost, "total"),
	};
}

function modelRefFromRecord(
	record: JsonRecord,
	message: JsonRecord,
	usage: JsonRecord,
): RunnerSubagentUsageModelRef {
	return {
		provider: firstStringField({ record, message, usage, keys: ["provider"] }),
		api: firstStringField({ record, message, usage, keys: ["api"] }),
		model: firstStringField({ record, message, usage, keys: ["model"] }),
	};
}

function contextWindowFromRecord(
	record: JsonRecord,
	message: JsonRecord,
	usage: JsonRecord,
): number | undefined {
	return firstField({
		record,
		message,
		usage,
		keys: ["contextWindow", "context_window"],
		extract: positiveNumberField,
	});
}

function firstStringField(options: {
	record: JsonRecord;
	message: JsonRecord;
	usage: JsonRecord;
	keys: readonly string[];
}): string | null {
	return firstField({ ...options, extract: stringField }) ?? null;
}

function firstField<T>(options: FieldSearchOptions<T>): T | undefined {
	for (const container of [options.message, options.record, options.usage]) {
		for (const key of options.keys) {
			const value = options.extract(container, key);
			if (value !== undefined) return value;
		}
	}

	for (const container of [options.message, options.record, options.usage]) {
		for (const nestedKey of ["modelInfo", "model_info", "modelRef", "model_ref"]) {
			const nested = mappingField(container, nestedKey);
			if (nested === null) continue;
			for (const key of options.keys) {
				const value = options.extract(nested, key);
				if (value !== undefined) return value;
			}
		}
	}
	return undefined;
}

function hasUsableTokenUsage(usage: JsonRecord): boolean {
	return TOKEN_FIELDS.some(
		(field) => typeof usage[field] === "number" && Number.isFinite(usage[field]),
	);
}

function mappingField(data: JsonRecord, key: string): JsonRecord | null {
	const value = data[key];
	if (!isRecord(value)) return null;
	return value;
}

function stringField(data: JsonRecord, key: string): string | undefined {
	const value = data[key];
	if (typeof value === "string" && value.trim() !== "") return value;
	return undefined;
}

function numberField(data: JsonRecord, key: string): number {
	return finiteNumberField(data, key) ?? 0;
}

function positiveNumberField(data: JsonRecord, key: string): number | undefined {
	const value = finiteNumberField(data, key);
	if (value === undefined || value <= 0) return undefined;
	return value;
}

function jsonParseErrorMessage(error: unknown): string {
	if (!(error instanceof SyntaxError))
		return error instanceof Error ? error.message : String(error);
	const [message] = error.message.split(" at ");
	return message ?? error.message;
}
