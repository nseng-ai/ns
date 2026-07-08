import { describe, expect, test } from "vitest";

import {
	formatRunnerSubagentActivityWidgetLines,
	setRunnerSubagentWidget,
	createSubprocessSubagentRuntime,
} from "@nseng-ai/ns-pi-subagents/api";

describe("ns-pi-subagents /api surface", () => {
	test("exports runner widget helpers and subprocess runtime", () => {
		expect(formatRunnerSubagentActivityWidgetLines).toBeTypeOf("function");
		expect(setRunnerSubagentWidget).toBeTypeOf("function");
		expect(createSubprocessSubagentRuntime).toBeTypeOf("function");
	});
});
