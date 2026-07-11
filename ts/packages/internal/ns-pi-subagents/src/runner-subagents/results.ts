import type { RunnerSubagentErrorResult, RunnerSubagentProgress } from "./extension-api.ts";

export function errorResult(
	progress: RunnerSubagentProgress,
	diagnostic: string,
	error: unknown = new Error(diagnostic),
): RunnerSubagentErrorResult {
	return {
		...(progress.title === undefined ? {} : { title: progress.title }),
		status: "error",
		diagnostic,
		error: errorPayload(error, diagnostic),
		elapsedMs: progress.elapsedMs,
		progress,
		...(progress.sessionFile === undefined ? {} : { sessionFile: progress.sessionFile }),
	};
}

function errorPayload(error: unknown, fallbackMessage: string): RunnerSubagentErrorResult["error"] {
	if (!(error instanceof Error)) return { message: fallbackMessage };
	return {
		message: error.message.length === 0 ? fallbackMessage : error.message,
		...(error.name.length === 0 ? {} : { name: error.name }),
		...(error.stack === undefined ? {} : { stack: error.stack }),
	};
}
