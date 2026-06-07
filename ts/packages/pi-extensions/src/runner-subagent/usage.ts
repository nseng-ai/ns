import { errorMessage } from "../handoff/shared.ts";
import type {
	RunnerSubagentUsageMetadata,
	RunnerSubagentUsageTotals,
	RunnerSubagentUsageUnavailableReason,
} from "../runner-subagent.ts";
import { isRecord } from "./json-events.ts";

export interface ReadRunnerSubagentSessionFile {
	(sessionFile: string): string | Promise<string>;
}

export interface AggregateRunnerSubagentUsageOptions {
	sessionFile?: string;
}

type UsageField = "input" | "output" | "cacheRead" | "cacheWrite" | "totalTokens";
type CostField = "input" | "output" | "cacheRead" | "cacheWrite" | "total";

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
	let totals: RunnerSubagentUsageTotals = {
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
		totals = addUsageTotals(totals, usage);
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

function addUsageTotals(left: RunnerSubagentUsageTotals, right: RunnerSubagentUsageTotals): RunnerSubagentUsageTotals {
	return {
		input: left.input + right.input,
		output: left.output + right.output,
		cacheRead: left.cacheRead + right.cacheRead,
		cacheWrite: left.cacheWrite + right.cacheWrite,
		totalTokens: left.totalTokens + right.totalTokens,
		cost: {
			input: left.cost.input + right.cost.input,
			output: left.cost.output + right.cost.output,
			cacheRead: left.cost.cacheRead + right.cost.cacheRead,
			cacheWrite: left.cost.cacheWrite + right.cost.cacheWrite,
			total: left.cost.total + right.cost.total,
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
