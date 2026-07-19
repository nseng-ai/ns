import { describe, expect, test } from "vitest";

import type { ExecResult } from "@nseng-ai/foundation/exec";
import {
	PI_AGENT_DEFINITION_SCHEMA,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";
import type { ToolContext, ToolDefinition } from "@nseng-ai/pi/runtime/tool-types";

import { EXPLORER_AGENT_DESCRIPTOR } from "../../src/agents/explorer.ts";
import { createSubagentAgentRegistry } from "../../src/agents/registry.ts";
import { TASK_AGENT_DESCRIPTOR } from "../../src/agents/task.ts";
import { SubagentFleetRegistry } from "../../src/fleet/registry.ts";
import {
	createFunctionSubagentRuntime,
	createSubagentRuntimeRegistry,
	type SubagentRuntimeDispatchInput,
} from "../../src/runtime/seam.ts";
import {
	registerSubagentTool,
	SUBAGENT_TOOL_NAME,
	type SubagentToolHost,
} from "../../src/tool/subagent.ts";
import { makeFinalTextResult } from "../helpers/fleet-testing.ts";

class FakeToolHost implements SubagentToolHost {
	readonly tools = new Map<string, ToolDefinition>();

	registerTool(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition);
	}

	async exec(): Promise<ExecResult> {
		return { type: "exited", stdout: "", stderr: "", code: 0, signal: null };
	}
}

function definition(name: string): PiAgentDefinition {
	if (name !== "explorer" && name !== "task") throw new Error(`Unknown fixture ${name}.`);
	return {
		schema: PI_AGENT_DEFINITION_SCHEMA,
		name,
		toolName: SUBAGENT_TOOL_NAME,
		label: name,
		description: `${name} fixture`,
		promptGuidelines: [],
		delegationDoctrine: [],
		body: "{{prompt}}",
		filePath: `/repo/.ns/pi/agents/${name}.md`,
	};
}

function registerRoutingTool(dispatched: SubagentRuntimeDispatchInput[]): ToolDefinition {
	const pi = new FakeToolHost();
	registerSubagentTool(pi, {
		agents: createSubagentAgentRegistry(
			[EXPLORER_AGENT_DESCRIPTOR, TASK_AGENT_DESCRIPTOR],
			definition,
		),
		fleetRegistry: new SubagentFleetRegistry(),
		loadAgentDefinition: definition,
		isProviderAuthConfigured: () => false,
		runtimes: createSubagentRuntimeRegistry(
			(["subprocess", "in-process"] as const).map((kind) => ({
				kind,
				create: () => ({
					ok: true as const,
					runtime: createFunctionSubagentRuntime(async (input) => {
						dispatched.push(input);
						return makeFinalTextResult("done");
					}),
				}),
			})),
		),
	});
	const tool = pi.tools.get(SUBAGENT_TOOL_NAME);
	if (tool === undefined) throw new Error("Missing subagent tool.");
	return tool;
}

function context(provider = "openai-codex"): ToolContext {
	return {
		cwd: "/repo",
		mode: "tui",
		hasUI: false,
		ui: { notify: () => {} },
		model: { provider, id: "parent-strong" },
	};
}

const TASKS = [{ title: "focused", prompt: "do the work" }];

describe("subagent model routing", () => {
	test("task omission inherits without an explicit model", async () => {
		const dispatched: SubagentRuntimeDispatchInput[] = [];
		const tool = registerRoutingTool(dispatched);

		await tool.execute("call", { agent: "task", tasks: TASKS }, undefined, undefined, context());

		expect(dispatched).toHaveLength(1);
		expect(dispatched[0]?.options.modelSelection).toBeUndefined();
	});

	test.each(["subprocess", "in-process"] as const)(
		"task cheap routing remains provider-local with %s execution",
		async (execution) => {
			const dispatched: SubagentRuntimeDispatchInput[] = [];
			const tool = registerRoutingTool(dispatched);

			await tool.execute(
				"call",
				{ agent: "task", tasks: TASKS, routing: "cheap", execution },
				undefined,
				undefined,
				context(),
			);

			expect(dispatched[0]?.options.modelSelection).toEqual({
				provider: "openai-codex",
				modelId: "gpt-5.6-luna",
			});
		},
	);

	test("unknown parent provider inherits for cheap routing", async () => {
		const dispatched: SubagentRuntimeDispatchInput[] = [];
		const tool = registerRoutingTool(dispatched);

		await tool.execute(
			"call",
			{ agent: "task", tasks: TASKS, routing: "cheap" },
			undefined,
			undefined,
			context("acme"),
		);

		expect(dispatched[0]?.options.modelSelection).toBeUndefined();
	});

	test("explorer omission preserves descriptor-owned cheap routing", async () => {
		const dispatched: SubagentRuntimeDispatchInput[] = [];
		const tool = registerRoutingTool(dispatched);

		await tool.execute(
			"call",
			{ agent: "explorer", tasks: TASKS },
			undefined,
			undefined,
			context("anthropic"),
		);

		expect(dispatched[0]?.options.modelSelection).toEqual({
			provider: "anthropic",
			modelId: "claude-haiku-4-5",
		});
	});

	test.each([
		{ agent: "task", tasks: TASKS, model: "anthropic/claude-sonnet-4-6" },
		{ agent: "task", tasks: TASKS, routing: "strong" },
		{ agent: "task", tasks: TASKS, surprise: true },
	])("rejects legacy, malformed, and unknown input before dispatch", async (input) => {
		const dispatched: SubagentRuntimeDispatchInput[] = [];
		const tool = registerRoutingTool(dispatched);

		const result = await tool.execute("call", input, undefined, undefined, context());

		expect(result.details).toMatchObject({ status: "configuration-error" });
		expect(dispatched).toEqual([]);
	});
});
