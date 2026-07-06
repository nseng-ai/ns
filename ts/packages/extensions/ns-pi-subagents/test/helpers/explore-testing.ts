import {
	PI_AGENT_DEFINITION_SCHEMA,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";

import type {
	RunnerSubagentContext,
	RunnerSubagentErrorResult,
	RunnerSubagentFinalTextResult,
	RunnerSubagentOptions,
	RunnerSubagentPi,
	RunnerSubagentProgress,
	RunnerSubagentProtocolErrorResult,
	RunnerSubagentResult,
	RunnerSubagentStoppedWithoutUsefulTextResult,
} from "../../src/runner-subagents/index.ts";
import {
	EXPLORE_TOOL_NAME,
	EXPLORER_AGENT_NAME,
	EXPLORER_AGENT_REPO_RELATIVE_PATH,
	EXPLORER_SCOUT_SECTION_HEADERS,
} from "../../src/explore/contract.ts";
export {
	createFakeRunnerSubagentDispatcher,
	FakeSpawnedChildProcess,
	jsonLine,
	sessionMessageLine,
	waitForSpawn,
} from "../../src/runner-subagents/testing.ts";

export function makeExplorerAgentDefinition(
	overrides: Partial<PiAgentDefinition> = {},
): PiAgentDefinition {
	return {
		schema: PI_AGENT_DEFINITION_SCHEMA,
		name: EXPLORER_AGENT_NAME,
		toolName: EXPLORE_TOOL_NAME,
		label: "Explorer",
		description: "Fake explorer agent definition for tests.",
		promptGuidelines: ["Use explore for read-only reconnaissance."],
		body: [
			"You are a fake explorer.",
			"",
			...EXPLORER_SCOUT_SECTION_HEADERS,
			"",
			"## Delegated exploration",
			"",
			"{{prompt}}",
		].join("\n"),
		filePath: `/fake/${EXPLORER_AGENT_REPO_RELATIVE_PATH}`,
		...overrides,
	};
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

export function makeProtocolErrorResult(diagnostic: string): RunnerSubagentProtocolErrorResult {
	return {
		status: "protocol-error",
		diagnostic,
		protocolError: { message: diagnostic },
		elapsedMs: 5,
		progress: stoppedProgress(),
	};
}

export function makeStoppedWithoutUsefulTextResult(
	diagnostic: string,
): RunnerSubagentStoppedWithoutUsefulTextResult {
	return {
		status: "stopped-without-useful-text",
		diagnostic,
		elapsedMs: 5,
		progress: stoppedProgress(),
	};
}

export interface RecordedExplorerDispatchCall {
	pi: RunnerSubagentPi;
	ctx: RunnerSubagentContext;
	options: RunnerSubagentOptions;
}

export type RecordedExplorerDispatchFn = (
	pi: RunnerSubagentPi,
	ctx: RunnerSubagentContext,
	options: RunnerSubagentOptions,
) => Promise<RunnerSubagentResult>;

/**
 * Scripted dispatch fake: returns the queued results in order and records every call.
 * Throws if dispatched more times than results were scripted.
 */
export function createRecordingExplorerDispatch(results: readonly RunnerSubagentResult[]): {
	dispatch: RecordedExplorerDispatchFn;
	calls: RecordedExplorerDispatchCall[];
} {
	const calls: RecordedExplorerDispatchCall[] = [];
	const dispatch: RecordedExplorerDispatchFn = (pi, ctx, options) => {
		const result = results[calls.length];
		if (result === undefined) {
			throw new Error(`Unexpected explorer dispatch call #${calls.length + 1}.`);
		}
		calls.push({ pi, ctx, options });
		return Promise.resolve(result);
	};
	return { dispatch, calls };
}
