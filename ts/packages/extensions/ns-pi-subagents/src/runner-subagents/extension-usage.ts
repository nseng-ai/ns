import {
	addRuntimeRunnerSubagentUsageCostTotals,
	addRuntimeRunnerSubagentUsageTotals,
	parseRunnerSubagentUsageJsonl,
	type RunnerSubagentUsageRecord,
	type RuntimeRunnerSubagentUsageCostTotals,
	type RuntimeRunnerSubagentUsageTotals,
} from "@nseng-ai/foundation/runner-usage";

import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import type {
	RunnerSubagentUsageMetadata,
	RunnerSubagentUsageUnavailableReason,
} from "./extension-api.ts";

export interface ReadRunnerSubagentSessionFile {
	(sessionFile: string): string | Promise<string>;
}

export interface AggregateRunnerSubagentUsageOptions {
	sessionFile?: string;
}

export async function readRunnerSubagentUsageFromSessionFile(
	sessionFile: string | undefined,
	readSessionFile: ReadRunnerSubagentSessionFile,
): Promise<RunnerSubagentUsageMetadata> {
	if (sessionFile === undefined) {
		return unavailableUsage({
			reason: "missing-session-file",
			diagnostic: "Forked Pi session file path is missing; usage was not collected.",
		});
	}

	let jsonl: string;
	try {
		jsonl = await readSessionFile(sessionFile);
	} catch (error) {
		return unavailableUsage({
			sessionFile,
			reason: "session-read-error",
			diagnostic: `Forked Pi session file is not readable: ${formatErrorMessage(error)}`,
		});
	}

	return usageMetadataFromSessionJsonl(jsonl, { sessionFile });
}

function usageMetadataFromSessionJsonl(
	jsonl: string,
	options: AggregateRunnerSubagentUsageOptions = {},
): RunnerSubagentUsageMetadata {
	const parsed = parseRunnerSubagentUsageJsonl(jsonl);
	if (parsed.type === "invalid-json") {
		return unavailableUsage({
			...(options.sessionFile === undefined ? {} : { sessionFile: options.sessionFile }),
			reason: "malformed-session-jsonl",
			diagnostic: `Forked Pi session JSONL is malformed on line ${parsed.line}: ${parsed.message}`,
		});
	}

	if (parsed.records.length === 0) {
		return unavailableUsage({
			...(options.sessionFile === undefined ? {} : { sessionFile: options.sessionFile }),
			reason: "no-assistant-usage",
			diagnostic:
				"Forked Pi session did not contain assistant messages with usable usage metadata.",
		});
	}

	let tokens = zeroRuntimeTokens();
	let cost = zeroRuntimeCost();
	for (const record of parsed.records) {
		tokens = addRuntimeRunnerSubagentUsageTotals(tokens, record.tokens);
		cost = addRuntimeRunnerSubagentUsageCostTotals(cost, record.cost);
	}

	const trend = trendFromUsageRecords(parsed.records);
	return {
		status: "available",
		source: "child-session-file",
		sessionFile: options.sessionFile ?? "(unknown)",
		assistantMessageCount: parsed.records.length,
		totals: { ...tokens, cost },
		trend,
		...(trend.contextWindow === undefined ? {} : { contextWindow: trend.contextWindow }),
	};
}

function trendFromUsageRecords(records: readonly RunnerSubagentUsageRecord[]) {
	const latest = records.at(-1);
	if (latest === undefined) throw new Error("usage trend requires at least one usage record");
	let peakPromptTokens = 0;
	let peakTotalTokens = 0;
	let contextWindow: number | undefined;
	for (const record of records) {
		peakPromptTokens = Math.max(peakPromptTokens, record.peakPromptTokens);
		peakTotalTokens = Math.max(peakTotalTokens, record.peakTotalTokens);
		if (record.contextWindow !== undefined) {
			contextWindow = Math.max(contextWindow ?? 0, record.contextWindow);
		}
	}
	return {
		latestTurn: { ...latest.tokens, cost: latest.cost },
		peakPromptTokens,
		peakTotalTokens,
		...(contextWindow === undefined ? {} : { contextWindow }),
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

function zeroRuntimeTokens(): RuntimeRunnerSubagentUsageTotals {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
}

function zeroRuntimeCost(): RuntimeRunnerSubagentUsageCostTotals {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}
