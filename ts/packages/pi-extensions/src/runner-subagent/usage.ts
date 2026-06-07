import type {
	RunnerSubagentUsageMetadata,
	RunnerSubagentUsageTotals,
	RunnerSubagentUsageUnavailableReason,
} from "../runner-subagent.ts";

export interface ReadRunnerSubagentSessionFile {
	(sessionFile: string): string | Promise<string>;
}

export interface AggregateRunnerSubagentUsageOptions {
	sessionFile?: string;
}

type UsageField = "input" | "output" | "cacheRead" | "cacheWrite" | "totalTokens";
type CostField = "input" | "output" | "cacheRead" | "cacheWrite" | "total";

const ZERO_USAGE_TOTALS: RunnerSubagentUsageTotals = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0,
	},
};

export async function readRunnerSubagentUsageFromSessionFile(
	sessionFile: string | undefined,
	readSessionFile: ReadRunnerSubagentSessionFile,
): Promise<RunnerSubagentUsageMetadata> {
	if (sessionFile === undefined) {
		return unavailableUsage({
			reason: "missing-session-file",
			diagnostic: "Subagent child session file path is missing; usage was not collected.",
		});
	}

	let jsonl: string;
	try {
		jsonl = await readSessionFile(sessionFile);
	} catch (error) {
		return unavailableUsage({
			sessionFile,
			reason: "session-read-error",
			diagnostic: `Subagent child session file is not readable: ${errorMessage(error)}`,
		});
	}

	return aggregateRunnerSubagentUsageFromSessionJsonl(jsonl, { sessionFile });
}

export function aggregateRunnerSubagentUsageFromSessionJsonl(
	jsonl: string,
	options: AggregateRunnerSubagentUsageOptions = {},
): RunnerSubagentUsageMetadata {
	const totals = cloneUsageTotals(ZERO_USAGE_TOTALS);
	let assistantMessageCount = 0;
	let lineNumber = 0;

	for (const rawLine of jsonl.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (line.length === 0) continue;
		lineNumber += 1;

		let record: unknown;
		try {
			record = JSON.parse(line) as unknown;
		} catch (error) {
			return unavailableUsage({
				...(options.sessionFile === undefined ? {} : { sessionFile: options.sessionFile }),
				reason: "malformed-session-jsonl",
				diagnostic: `Subagent child session JSONL is malformed on line ${lineNumber}: ${errorMessage(error)}`,
			});
		}

		const usage = assistantUsageFromRecord(record);
		if (usage === undefined) continue;
		assistantMessageCount += 1;
		addUsageTotals(totals, usage);
	}

	if (assistantMessageCount === 0) {
		return unavailableUsage({
			...(options.sessionFile === undefined ? {} : { sessionFile: options.sessionFile }),
			reason: "no-assistant-usage",
			diagnostic: "Subagent child session did not contain assistant messages with usable usage metadata.",
		});
	}

	return {
		status: "available",
		source: "child-session-file",
		sessionFile: options.sessionFile ?? "(unknown)",
		assistantMessageCount,
		totals,
	};
}

function assistantUsageFromRecord(record: unknown): RunnerSubagentUsageTotals | undefined {
	if (!isRecord(record) || record.type !== "message") return undefined;
	const message = record.message;
	if (!isRecord(message) || message.role !== "assistant") return undefined;
	const usage = message.usage;
	if (!isRecord(usage) || !hasUsableTokenUsage(usage)) return undefined;

	const cost = isRecord(usage.cost) ? usage.cost : {};
	return {
		input: numberField(usage, "input"),
		output: numberField(usage, "output"),
		cacheRead: numberField(usage, "cacheRead"),
		cacheWrite: numberField(usage, "cacheWrite"),
		totalTokens: numberField(usage, "totalTokens"),
		cost: {
			input: numberField(cost, "input"),
			output: numberField(cost, "output"),
			cacheRead: numberField(cost, "cacheRead"),
			cacheWrite: numberField(cost, "cacheWrite"),
			total: numberField(cost, "total"),
		},
	};
}

function hasUsableTokenUsage(usage: Record<string, unknown>): boolean {
	const fields: UsageField[] = ["input", "output", "cacheRead", "cacheWrite", "totalTokens"];
	return fields.some((field) => typeof usage[field] === "number" && Number.isFinite(usage[field]));
}

function addUsageTotals(target: RunnerSubagentUsageTotals, source: RunnerSubagentUsageTotals): void {
	target.input += source.input;
	target.output += source.output;
	target.cacheRead += source.cacheRead;
	target.cacheWrite += source.cacheWrite;
	target.totalTokens += source.totalTokens;
	target.cost.input += source.cost.input;
	target.cost.output += source.cost.output;
	target.cost.cacheRead += source.cost.cacheRead;
	target.cost.cacheWrite += source.cost.cacheWrite;
	target.cost.total += source.cost.total;
}

function cloneUsageTotals(totals: RunnerSubagentUsageTotals): RunnerSubagentUsageTotals {
	return {
		input: totals.input,
		output: totals.output,
		cacheRead: totals.cacheRead,
		cacheWrite: totals.cacheWrite,
		totalTokens: totals.totalTokens,
		cost: {
			input: totals.cost.input,
			output: totals.cost.output,
			cacheRead: totals.cost.cacheRead,
			cacheWrite: totals.cost.cacheWrite,
			total: totals.cost.total,
		},
	};
}

function unavailableUsage(input: {
	sessionFile?: string;
	reason: RunnerSubagentUsageUnavailableReason;
	diagnostic: string;
}): RunnerSubagentUsageMetadata {
	return {
		status: "unavailable",
		source: "child-session-file",
		...(input.sessionFile === undefined ? {} : { sessionFile: input.sessionFile }),
		reason: input.reason,
		diagnostic: input.diagnostic,
	};
}

function numberField(record: Record<string, unknown>, field: UsageField | CostField): number {
	const value = record[field];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
