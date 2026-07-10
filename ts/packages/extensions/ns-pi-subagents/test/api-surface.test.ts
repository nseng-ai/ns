import { describe, expect, test } from "vitest";

import {
	formatRunnerSubagentActivityWidgetLines,
	setRunnerSubagentWidget,
	PI_IN_PROCESS_RESOURCE_POLICY,
	SUBAGENT_TOOL_NAME,
	createSubagentAgentRegistry,
	createSubagentRuntimeRegistry,
	createSubprocessSubagentRuntime,
} from "@nseng-ai/ns-pi-subagents/api";

describe("ns-pi-subagents /api surface", () => {
	test("exports runner widget helpers and subprocess runtime", () => {
		expect(formatRunnerSubagentActivityWidgetLines).toBeTypeOf("function");
		expect(setRunnerSubagentWidget).toBeTypeOf("function");
		expect(createSubprocessSubagentRuntime).toBeTypeOf("function");
		expect(createSubagentAgentRegistry).toBeTypeOf("function");
		expect(createSubagentRuntimeRegistry).toBeTypeOf("function");
		expect(SUBAGENT_TOOL_NAME).toBe("subagent");
		expect(PI_IN_PROCESS_RESOURCE_POLICY).toEqual({
			extensions: false,
			skills: true,
			contextFiles: true,
			delegatedPromptTemplates: false,
		});
	});
});
