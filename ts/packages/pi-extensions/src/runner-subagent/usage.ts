import {
	addRunnerSubagentUsageCostTotals,
	addRunnerSubagentUsageTotals,
	parseRunnerSubagentUsageJsonl,
	type RunnerSubagentUsageCostTotals as RuntimeRunnerSubagentUsageCostTotals,
	type RunnerSubagentUsageTotals as RuntimeRunnerSubagentUsageTotals,
} from "@asdl/pi-extension-runtime/runner-subagent-usage";

import { formatErrorMessage } from "@asdl/core/primitives";
import type { RunnerSubagentUsageMetadata, RunnerSubagentUsageUnavailableReason } from "../runner-subagent.ts";

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
			diagnostic: `Subagent child session file is not readable: ${formatErrorMessage(error)}`,
		});
	}

	return usageMetadataFromSessionJsonl(jsonl, { sessionFile });
}

function usageMetadataFromSessionJsonl(jsonl: string, options: AggregateRunnerSubagentUsageOptions = {}): RunnerSubagentUsageMetadata {
	const parsed = parseRunnerSubagentUsageJsonl(jsonl);
	if (parsed.type === "invalid-json") {
		return unavailableUsage({
			...(options.sessionFile === undefined ? {} : { sessionFile: options.sessionFile }),
			reason: "malformed-session-jsonl",
			diagnostic: `Subagent child session JSONL is malformed on line ${parsed.line}: ${parsed.message}`,
		});
	}

	if (parsed.records.length === 0) {
		return unavailableUsage({
			...(options.sessionFile === undefined ? {} : { sessionFile: options.sessionFile }),
			reason: "no-assistant-usage",
			diagnostic: "Subagent child session did not contain assistant messages with usable usage metadata.",
		});
	}

	let tokens = zeroRuntimeTokens();
	let cost = zeroRuntimeCost();
	for (const record of parsed.records) {
		tokens = addRunnerSubagentUsageTotals(tokens, record.tokens);
		cost = addRunnerSubagentUsageCostTotals(cost, record.cost);
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
