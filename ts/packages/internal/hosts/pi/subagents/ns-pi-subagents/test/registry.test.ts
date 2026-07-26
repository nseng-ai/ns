import { describe, expect, test } from "vitest";

import {
	PI_AGENT_DEFINITION_SCHEMA,
	type PiAgentDefinition,
} from "@nseng-ai/pi-runtime/runtime/agent-definition";
import type { ToolContext } from "@nseng-ai/pi-runtime/runtime/tool-types";
import { EXPLORER_AGENT_DESCRIPTOR } from "../src/agents/explorer.ts";
import { createSubagentAgentRegistry } from "../src/agents/registry.ts";
import { createTestSessionReader } from "./helpers/test-session-reader.ts";
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

function toolContext(): ToolContext {
	return {
		cwd: "/repo",
		mode: "tui",
		hasUI: false,
		sessionManager: createTestSessionReader(),
		ui: { notify: () => {} },
	};
}

describe("subagent registries", () => {
	test("rejects duplicate agent and runtime names", () => {
		expect(() =>
			createSubagentAgentRegistry([EXPLORER_AGENT_DESCRIPTOR, EXPLORER_AGENT_DESCRIPTOR], () =>
				definition(),
			),
		).toThrow(/Duplicate/);
		expect(() =>
			createSubagentRuntimeRegistry([
				{ kind: "subprocess", create: () => ({ ok: true, runtime }) },
				{ kind: "subprocess", create: () => ({ ok: true, runtime }) },
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
		const registry = createSubagentRuntimeRegistry([
			{ kind: "subprocess", create: () => ({ ok: true, runtime }) },
		]);
		expect(
			registry.resolve({
				ctx: toolContext(),
				execution: "auto",
				supported: ["subprocess", "in-process"],
				preference: ["subprocess", "in-process"],
			}),
		).toMatchObject({ ok: true, kind: "subprocess" });
		expect(
			registry.resolve({
				ctx: toolContext(),
				execution: "in-process",
				supported: ["subprocess", "in-process"],
				preference: ["subprocess"],
			}),
		).toMatchObject({ ok: false });

		const fallback = createSubagentRuntimeRegistry([
			{
				kind: "in-process",
				create: () => ({ ok: false, diagnostic: "host registry unavailable" }),
			},
			{ kind: "subprocess", create: () => ({ ok: true, runtime }) },
		]);
		expect(
			fallback.resolve({
				ctx: toolContext(),
				execution: "auto",
				supported: ["subprocess", "in-process"],
				preference: ["in-process", "subprocess"],
			}),
		).toMatchObject({ ok: true, kind: "subprocess" });
	});
});
