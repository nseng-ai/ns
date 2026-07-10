import type {
	RunnerSubagentErrorResult,
	RunnerSubagentFinalTextResult,
	RunnerSubagentProgress,
} from "../../src/runner-subagents/index.ts";

export async function settleMicrotasks(count = 20): Promise<void> {
	for (let index = 0; index < count; index += 1) await Promise.resolve();
}

export function stoppedProgress(): RunnerSubagentProgress {
	return { state: "stopped", toolCount: 0, turnCount: 1, elapsedMs: 5 };
}

export function makeFinalTextResult(finalText: string): RunnerSubagentFinalTextResult {
	return {
		status: "final-text",
		finalText,
		elapsedMs: 5,
		progress: stoppedProgress(),
	};
}

export function makeErrorResult(diagnostic: string): RunnerSubagentErrorResult {
	return {
		status: "error",
		diagnostic,
		error: { message: diagnostic },
		elapsedMs: 5,
		progress: stoppedProgress(),
	};
}
