export interface RunnerSubagentUsageTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
}

export interface RunnerSubagentUsageCostTotals {
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
	tokens: RunnerSubagentUsageTotals;
	cost: RunnerSubagentUsageCostTotals;
	model: RunnerSubagentUsageModelRef;
	peakTotalTokens: number;
	peakPromptTokens: number;
}

export type ParseRunnerSubagentUsageJsonlResult =
	| { type: "ok"; records: readonly RunnerSubagentUsageRecord[] }
	| { type: "invalid-json"; line: number; message: string };

type JsonRecord = Record<string, unknown>;

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

export function addRunnerSubagentUsageTotals(left: RunnerSubagentUsageTotals, right: RunnerSubagentUsageTotals): RunnerSubagentUsageTotals {
	return {
		input: left.input + right.input,
		output: left.output + right.output,
		cacheRead: left.cacheRead + right.cacheRead,
		cacheWrite: left.cacheWrite + right.cacheWrite,
		totalTokens: left.totalTokens + right.totalTokens,
	};
}

export function addRunnerSubagentUsageCostTotals(
	left: RunnerSubagentUsageCostTotals,
	right: RunnerSubagentUsageCostTotals,
): RunnerSubagentUsageCostTotals {
	return {
		input: left.input + right.input,
		output: left.output + right.output,
		cacheRead: left.cacheRead + right.cacheRead,
		cacheWrite: left.cacheWrite + right.cacheWrite,
		total: left.total + right.total,
	};
}

function usageFromRecord(record: unknown): RunnerSubagentUsageRecord | null {
	if (!isJsonRecord(record)) return null;
	if (record.type !== undefined && record.type !== "message") return null;

	const message = mappingField(record, "message");
	if (message === null || message.role !== "assistant") return null;

	const usage = mappingField(message, "usage");
	if (usage === null || !hasUsableTokenUsage(usage)) return null;

	const tokens = tokensFromUsage(usage);
	return {
		tokens,
		cost: costFromUsage(usage),
		model: modelRefFromRecord(record, message, usage),
		peakTotalTokens: tokens.totalTokens,
		peakPromptTokens: tokens.input + tokens.cacheRead + tokens.cacheWrite,
	};
}

function tokensFromUsage(usage: JsonRecord): RunnerSubagentUsageTotals {
	return {
		input: numberField(usage, "input"),
		output: numberField(usage, "output"),
		cacheRead: numberField(usage, "cacheRead"),
		cacheWrite: numberField(usage, "cacheWrite"),
		totalTokens: numberField(usage, "totalTokens"),
	};
}

function costFromUsage(usage: JsonRecord): RunnerSubagentUsageCostTotals {
	const cost = mappingField(usage, "cost") ?? {};
	return {
		input: numberField(cost, "input"),
		output: numberField(cost, "output"),
		cacheRead: numberField(cost, "cacheRead"),
		cacheWrite: numberField(cost, "cacheWrite"),
		total: numberField(cost, "total"),
	};
}

function modelRefFromRecord(record: JsonRecord, message: JsonRecord, usage: JsonRecord): RunnerSubagentUsageModelRef {
	return {
		provider: firstStringField(record, message, usage, "provider"),
		api: firstStringField(record, message, usage, "api"),
		model: firstStringField(record, message, usage, "model"),
	};
}

function firstStringField(record: JsonRecord, message: JsonRecord, usage: JsonRecord, key: string): string | null {
	const direct = stringField(message, key) ?? stringField(record, key) ?? stringField(usage, key);
	if (direct !== null) return direct;

	for (const container of [message, record, usage]) {
		for (const nestedKey of ["modelInfo", "model_info", "modelRef", "model_ref"]) {
			const nested = mappingField(container, nestedKey);
			if (nested === null) continue;
			const nestedValue = stringField(nested, key);
			if (nestedValue !== null) return nestedValue;
		}
	}
	return null;
}

function hasUsableTokenUsage(usage: JsonRecord): boolean {
	return TOKEN_FIELDS.some((field) => typeof usage[field] === "number" && Number.isFinite(usage[field]));
}

function mappingField(data: JsonRecord, key: string): JsonRecord | null {
	const value = data[key];
	if (!isJsonRecord(value)) return null;
	return value;
}

function stringField(data: JsonRecord, key: string): string | null {
	const value = data[key];
	if (typeof value === "string" && value.trim() !== "") return value;
	return null;
}

function numberField(data: JsonRecord, key: string): number {
	const value = data[key];
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	return value;
}

function isJsonRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonParseErrorMessage(error: unknown): string {
	if (!(error instanceof SyntaxError)) return error instanceof Error ? error.message : String(error);
	const [message] = error.message.split(" at ");
	return message ?? error.message;
}
