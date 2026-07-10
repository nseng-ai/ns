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
import {
	FORKED_PI_AGENT_TOOL_NAME,
	RUNNER_AGENT_NAME,
	RUNNER_AGENT_REPO_RELATIVE_PATH,
} from "../../src/runner-subagents/extension.ts";
export {
	createFakeRunnerSubagentDispatcher,
	FakeSpawnedChildProcess,
	jsonLine,
	sessionMessageLine,
	waitForSpawn,
} from "../../src/runner-subagents/testing.ts";

export async function settleMicrotasks(count = 20): Promise<void> {
	for (let index = 0; index < count; index += 1) await Promise.resolve();
}

type FakeAgentDefinitionBase = Pick<
	PiAgentDefinition,
	"name" | "toolName" | "label" | "description" | "promptGuidelines" | "body" | "filePath"
>;

function makeFakeAgentDefinition(
	base: FakeAgentDefinitionBase,
	overrides: Partial<PiAgentDefinition>,
): PiAgentDefinition {
	return {
		schema: PI_AGENT_DEFINITION_SCHEMA,
		...base,
		...overrides,
	};
}

export function makeExplorerAgentDefinition(
	overrides: Partial<PiAgentDefinition> = {},
): PiAgentDefinition {
	return makeFakeAgentDefinition(
		{
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
		},
		overrides,
	);
}

export function makeRunnerAgentDefinition(
	overrides: Partial<PiAgentDefinition> = {},
): PiAgentDefinition {
	return makeFakeAgentDefinition(
		{
			name: RUNNER_AGENT_NAME,
			toolName: FORKED_PI_AGENT_TOOL_NAME,
			label: "Forked Pi subagent",
			description: "Fake runner agent definition for tests.",
			promptGuidelines: ["Use forked_pi_agent for focused delegated work."],
			body: ["You are a fake runner.", "", "## Delegated task", "", "{{prompt}}"].join("\n"),
			filePath: `/fake/${RUNNER_AGENT_REPO_RELATIVE_PATH}`,
		},
		overrides,
	);
}

export function makePerAgentDefinitionLoader(
	definitions: ReadonlyMap<string, PiAgentDefinition>,
): (agentName: string) => PiAgentDefinition {
	return (agentName) => {
		const definition = definitions.get(agentName);
		if (definition === undefined) throw new Error(`No fake definition for ${agentName}.`);
		return definition;
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
