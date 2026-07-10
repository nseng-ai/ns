import { describe, expect, test } from "vitest";

import {
	PI_AGENT_DEFINITION_SCHEMA,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";
import { EXPLORER_AGENT_DESCRIPTOR } from "../src/agents/explorer.ts";
import { createSubagentAgentRegistry } from "../src/agents/registry.ts";
import {
	createFunctionSubagentRuntime,
	createSubagentRuntimeRegistry,
} from "../src/runtime/seam.ts";

function definition(name = "explorer", toolName = "subagent"): PiAgentDefinition {
	return {
		schema: PI_AGENT_DEFINITION_SCHEMA,
		name,
		toolName,
		label: name,
		description: name,
		promptGuidelines: [],
		delegationDoctrine: [],
		body: "{{prompt}}",
		filePath: `/repo/${name}.md`,
	};
}

const runtime = createFunctionSubagentRuntime(async () => ({
	status: "error",
	diagnostic: "unused",
	error: { message: "unused" },
	elapsedMs: 0,
	progress: { state: "stopped", toolCount: 0, turnCount: 0, elapsedMs: 0 },
}));

describe("subagent registries", () => {
	test("rejects duplicate agent and runtime names", () => {
		expect(() =>
			createSubagentAgentRegistry([EXPLORER_AGENT_DESCRIPTOR, EXPLORER_AGENT_DESCRIPTOR], () =>
				definition(),
			),
		).toThrow(/Duplicate/);
		expect(() =>
			createSubagentRuntimeRegistry([
				{ kind: "subprocess", create: () => runtime },
				{ kind: "subprocess", create: () => runtime },
			]),
		).toThrow(/Duplicate/);
	});

	test("keeps a mismatched definition as an unhealthy catalog entry", () => {
		const registry = createSubagentAgentRegistry([EXPLORER_AGENT_DESCRIPTOR], () =>
			definition("explorer", "explore"),
		);
		expect(registry.get("explorer")?.diagnostic).toContain('expected "subagent"');
	});

	test("resolves auto deterministically, falls through unavailable preferences, and rejects unavailable overrides", () => {
		const registry = createSubagentRuntimeRegistry([{ kind: "subprocess", create: () => runtime }]);
		expect(
			registry.resolve({
				execution: "auto",
				supported: ["subprocess", "in-process"],
				preference: ["subprocess", "in-process"],
			}),
		).toMatchObject({ ok: true, kind: "subprocess" });
		expect(
			registry.resolve({
				execution: "in-process",
				supported: ["subprocess", "in-process"],
				preference: ["subprocess"],
			}),
		).toMatchObject({ ok: false });

		const fallback = createSubagentRuntimeRegistry([
			{ kind: "in-process", create: () => ({ diagnostic: "host registry unavailable" }) },
			{ kind: "subprocess", create: () => runtime },
		]);
		expect(
			fallback.resolve({
				execution: "auto",
				supported: ["subprocess", "in-process"],
				preference: ["in-process", "subprocess"],
			}),
		).toMatchObject({ ok: true, kind: "subprocess" });
	});
});
