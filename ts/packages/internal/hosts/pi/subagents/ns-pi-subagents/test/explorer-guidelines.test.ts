import { describe, expect, test } from "vitest";

import { loadPiAgentDefinition } from "@nseng-ai/pi-runtime/runtime/agent-definition";

import { EXPLORER_AGENT_DESCRIPTOR } from "../src/agents/explorer.ts";

describe("explorer agent definition", () => {
	test("mentions the subagent or explorer choice in every parent-facing guideline", () => {
		const definition = loadPiAgentDefinition(EXPLORER_AGENT_DESCRIPTOR.name, process.cwd());
		const missingAgentChoice = definition.promptGuidelines
			.map((guideline, index) =>
				/\bsubagent\b|\bexplorer\b/u.test(guideline) ? undefined : index + 1,
			)
			.filter((index) => index !== undefined);

		expect(missingAgentChoice).toEqual([]);
	});
});
