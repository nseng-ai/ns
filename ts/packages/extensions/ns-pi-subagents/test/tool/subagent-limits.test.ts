import { describe, expect, test } from "vitest";

import type { ExecResult } from "@nseng-ai/foundation/exec";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import type { TimerScheduler } from "@nseng-ai/foundation/timers";
import {
	PI_AGENT_DEFINITION_SCHEMA,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";
import type { ToolDefinition } from "@nseng-ai/pi/runtime/tool-types";

import {
	createSubagentAgentRegistry,
	type SubagentAgentDescriptor,
} from "../../src/agents/registry.ts";
import { SubagentFleetRegistry } from "../../src/fleet/registry.ts";
import type { RunnerSubagentCancelledResult } from "../../src/runner-subagents/index.ts";
import {
	createFunctionSubagentRuntime,
	createSubagentRuntimeRegistry,
	type SubagentRuntimeDispatchFunction,
} from "../../src/runtime/seam.ts";
import {
	registerSubagentTool,
	SUBAGENT_TOOL_NAME,
	type SubagentToolHost,
} from "../../src/tool/subagent.ts";
import {
	makeFinalTextResult,
	settleMicrotasks,
	stoppedProgress,
	toolContext,
} from "../helpers/fleet-testing.ts";

const LIMITS_AGENT = "limits-probe";

const LIMITS_DEFINITION: PiAgentDefinition = {
	schema: PI_AGENT_DEFINITION_SCHEMA,
	name: LIMITS_AGENT,
	toolName: SUBAGENT_TOOL_NAME,
	label: "Limits probe",
	description: "Descriptor limits coverage fixture.",
	promptGuidelines: [],
	delegationDoctrine: [],
	body: "Probe: {{prompt}}",
	filePath: `/repo/.ns/pi/agents/${LIMITS_AGENT}.md`,
};

class FakeToolHost implements SubagentToolHost {
	readonly tools = new Map<string, ToolDefinition>();

	registerTool(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition);
	}

	async exec(): Promise<ExecResult> {
		return { stdout: "", stderr: "", code: 0, killed: false };
	}
}

function limitsDescriptor(
	overrides: Partial<SubagentAgentDescriptor> = {},
): SubagentAgentDescriptor {
	return {
		name: LIMITS_AGENT,
		definitionPath: `.ns/pi/agents/${LIMITS_AGENT}.md`,
		minTasks: 1,
		maxTasks: 4,
		maxConcurrency: 4,
		tools: ["read"],
		promptContext: "definition-only",
		modelPolicy: "inherit",
		maxTaskFinalTextChars: 8_000,
		supportedRuntimes: ["subprocess"],
		runtimePreference: ["subprocess"],
		...overrides,
	};
}

function registerLimitsTool(input: {
	descriptor: SubagentAgentDescriptor;
	dispatch: SubagentRuntimeDispatchFunction;
	timers?: TimerScheduler;
}): ToolDefinition {
	const pi = new FakeToolHost();
	registerSubagentTool(pi, {
		agents: createSubagentAgentRegistry([input.descriptor], () => LIMITS_DEFINITION),
		fleetRegistry: new SubagentFleetRegistry(),
		loadAgentDefinition: () => LIMITS_DEFINITION,
		runtimes: createSubagentRuntimeRegistry([
			{
				kind: "subprocess",
				create: () => ({ ok: true, runtime: createFunctionSubagentRuntime(input.dispatch) }),
			},
		]),
		...optionalEntry("timers", input.timers),
	});
	const tool = pi.tools.get(SUBAGENT_TOOL_NAME);
	if (tool === undefined) throw new Error("Missing subagent tool.");
	return tool;
}

function cancelledResult(reason: string): RunnerSubagentCancelledResult {
	return {
		status: "cancelled",
		diagnostic: reason,
		reason,
		elapsedMs: 0,
		progress: stoppedProgress(),
	};
}

function limitsTasks(count: number): Array<{ title: string; prompt: string }> {
	return Array.from({ length: count }, (_, index) => ({
		title: `task ${index}`,
		prompt: `inspect ${index}`,
	}));
}

describe("subagent descriptor limits", () => {
	test("aborts hanging tasks at the descriptor wall-clock limit", async () => {
		const manualTimers = createManualTimerScheduler();
		const tool = registerLimitsTool({
			descriptor: limitsDescriptor({ wallClockMs: 60_000 }),
			dispatch: (input) => {
				const signal = input.options.signal;
				if (signal === undefined) throw new Error("Expected a dispatch abort signal.");
				return new Promise((resolve) => {
					signal.addEventListener("abort", () => resolve(cancelledResult(String(signal.reason))), {
						once: true,
					});
				});
			},
			timers: manualTimers.timers,
		});

		const running = tool.execute(
			"call",
			{ agent: LIMITS_AGENT, tasks: limitsTasks(1) },
			undefined,
			undefined,
			toolContext(),
		);
		await settleMicrotasks();
		expect(manualTimers.pendingTimerCount()).toBe(1);

		manualTimers.advanceMs(60_000);
		const result = await running;

		expect(result.details).toMatchObject({
			status: "partial",
			tasks: [
				{ status: "cancelled", diagnostic: "subagent wall-clock limit exceeded after 60000ms" },
			],
		});
		expect(manualTimers.pendingTimerCount()).toBe(0);
	});

	test("cancels the wall-clock timer when the batch resolves before the limit", async () => {
		const manualTimers = createManualTimerScheduler();
		const tool = registerLimitsTool({
			descriptor: limitsDescriptor({ wallClockMs: 60_000 }),
			dispatch: async () => makeFinalTextResult("prompt answered"),
			timers: manualTimers.timers,
		});

		const result = await tool.execute(
			"call",
			{ agent: LIMITS_AGENT, tasks: limitsTasks(1) },
			undefined,
			undefined,
			toolContext(),
		);

		expect(result.details).toMatchObject({ status: "completed" });
		expect(manualTimers.pendingTimerCount()).toBe(0);
	});

	test("truncates final text at the per-task cap with a model-visible marker", async () => {
		const longText = `${"x".repeat(30)}END`;
		const tool = registerLimitsTool({
			descriptor: limitsDescriptor({ maxTaskFinalTextChars: 10 }),
			dispatch: async () => makeFinalTextResult(longText),
		});

		const result = await tool.execute(
			"call",
			{ agent: LIMITS_AGENT, tasks: limitsTasks(1) },
			undefined,
			undefined,
			toolContext(),
		);

		expect(result.details).toMatchObject({
			status: "completed",
			tasks: [{ status: "final-text", finalText: "x".repeat(10), finalTextTruncated: true }],
		});
		const text = result.content[0]?.text ?? "";
		expect(text).toContain(`[Final text truncated to 10 of ${longText.length} chars]`);
		expect(text).not.toContain("END");
	});

	test("bounds each task's final text by its share of the fleet cap", async () => {
		const longText = `${"y".repeat(50)}END`;
		const tool = registerLimitsTool({
			descriptor: limitsDescriptor({
				maxTaskFinalTextChars: 100,
				maxFleetFinalTextChars: 40,
			}),
			dispatch: async () => makeFinalTextResult(longText),
		});

		const result = await tool.execute(
			"call",
			{ agent: LIMITS_AGENT, tasks: limitsTasks(2) },
			undefined,
			undefined,
			toolContext(),
		);

		// The per-task share floor(40 / 2) = 20 binds below maxTaskFinalTextChars.
		expect(result.details).toMatchObject({
			status: "completed",
			tasks: [
				{ finalText: "y".repeat(20), finalTextTruncated: true },
				{ finalText: "y".repeat(20), finalTextTruncated: true },
			],
		});
		const text = result.content[0]?.text ?? "";
		expect(text).toContain(`[Final text truncated to 20 of ${longText.length} chars]`);
		expect(text).not.toContain("END");
	});

	test("leaves short final text unmarked and omits the truncation flag", async () => {
		const tool = registerLimitsTool({
			descriptor: limitsDescriptor(),
			dispatch: async () => makeFinalTextResult("short answer"),
		});

		const result = await tool.execute(
			"call",
			{ agent: LIMITS_AGENT, tasks: limitsTasks(1) },
			undefined,
			undefined,
			toolContext(),
		);

		expect(result.details).toMatchObject({
			status: "completed",
			tasks: [{ status: "final-text", finalText: "short answer" }],
		});
		expect(result.details).not.toHaveProperty("tasks.0.finalTextTruncated");
		expect(result.content[0]?.text ?? "").not.toContain("[Final text truncated");
	});

	test("bounds concurrent dispatches at descriptor maxConcurrency", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		const releases: Array<() => void> = [];
		const tool = registerLimitsTool({
			descriptor: limitsDescriptor({ maxTasks: 4, maxConcurrency: 2 }),
			dispatch: async () => {
				inFlight += 1;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await new Promise<void>((resolve) => releases.push(resolve));
				inFlight -= 1;
				return makeFinalTextResult("bounded");
			},
		});
		const tasks = limitsTasks(4);

		const running = tool.execute(
			"call",
			{ agent: LIMITS_AGENT, tasks },
			undefined,
			undefined,
			toolContext(),
		);
		await settleMicrotasks();
		expect(releases).toHaveLength(2);
		expect(maxInFlight).toBe(2);

		while (releases.length > 0) {
			releases.shift()?.();
			await settleMicrotasks();
		}
		const result = await running;

		expect(maxInFlight).toBe(2);
		expect(result.details).toMatchObject({
			status: "completed",
			tasks: tasks.map((task) => ({ title: task.title, status: "final-text" })),
		});
	});
});
