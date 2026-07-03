import {
	addRuntimeRunnerSubagentUsageCostTotals,
	addRuntimeRunnerSubagentUsageTotals,
	parseRunnerSubagentUsageJsonl,
	type RuntimeRunnerSubagentUsageCostTotals,
	type RuntimeRunnerSubagentUsageTotals,
} from "@ji/core/runner-usage";

import { formatErrorMessage } from "@ji/core/primitives";
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

	return {
		status: "available",
		source: "child-session-file",
		sessionFile: options.sessionFile ?? "(unknown)",
		assistantMessageCount: parsed.records.length,
		totals: { ...tokens, cost },
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
