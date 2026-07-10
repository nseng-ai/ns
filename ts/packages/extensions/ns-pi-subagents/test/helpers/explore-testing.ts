import {
	PI_AGENT_DEFINITION_SCHEMA,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";

import type {
	RunnerSubagentErrorResult,
	RunnerSubagentFinalTextResult,
	RunnerSubagentProgress,
} from "../../src/runner-subagents/index.ts";
import {
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

export async function settleMicrotasks(count = 20): Promise<void> {
	for (let index = 0; index < count; index += 1) await Promise.resolve();
}

type FakeAgentDefinitionBase = Pick<
	PiAgentDefinition,
	| "name"
	| "toolName"
	| "label"
	| "description"
	| "promptGuidelines"
	| "delegationDoctrine"
	| "body"
	| "filePath"
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
			toolName: "subagent",
			label: "Explorer",
			description: "Fake explorer agent definition for tests.",
			promptGuidelines: ["Use subagent agent explorer for read-only reconnaissance."],
			delegationDoctrine: ["### `subagent` agent `explorer` — parallel read-only scouts"],
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
