import {
	PI_AGENT_DEFINITION_SCHEMA,
	type PiAgentDefinition,
} from "@ns/pi/runtime/agent-definition";

import type {
	RunnerSubagentContext,
	RunnerSubagentErrorResult,
	RunnerSubagentFinalTextResult,
	RunnerSubagentOptions,
	RunnerSubagentPi,
	RunnerSubagentProgress,
	RunnerSubagentResult,
} from "../runner-subagents/extension-api.ts";
import { EXPLORE_TOOL_NAME, EXPLORER_AGENT_NAME } from "./contract.ts";
import type { DispatchSubagentFn } from "./dispatch.ts";

export {
	createFakeRunnerSubagentDispatcher,
	FakeSpawnedChildProcess,
	jsonLine,
	sessionMessageLine,
	waitForSpawn,
} from "../runner-subagents/testing.ts";

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
			"## Files Retrieved",
			"## Key Code",
			"## Architecture",
			"## Start Here",
			"",
			"## Delegated exploration",
			"",
			"{{prompt}}",
		].join("\n"),
		filePath: "/fake/.ns/pi/agents/explorer.md",
		...overrides,
	};
}

function stoppedProgress(): RunnerSubagentProgress {
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

export interface RecordedExplorerDispatchCall {
	pi: RunnerSubagentPi;
	ctx: RunnerSubagentContext;
	options: RunnerSubagentOptions;
}

/**
 * Scripted dispatch fake: returns the queued results in order and records every call.
 * Throws if dispatched more times than results were scripted.
 */
export function createRecordingExplorerDispatch(results: readonly RunnerSubagentResult[]): {
	dispatch: DispatchSubagentFn;
	calls: RecordedExplorerDispatchCall[];
} {
	const calls: RecordedExplorerDispatchCall[] = [];
	const dispatch: DispatchSubagentFn = (pi, ctx, options) => {
		const result = results[calls.length];
		if (result === undefined) {
			throw new Error(`Unexpected explorer dispatch call #${calls.length + 1}.`);
		}
		calls.push({ pi, ctx, options });
		return Promise.resolve(result);
	};
	return { dispatch, calls };
}
