import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import type {
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	ExtensionAPI,
	ExtensionHandler,
} from "@earendil-works/pi-coding-agent";
import {
	PI_AGENT_DEFINITION_SCHEMA,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";
import type { RawPiExecOptions, RawPiExecResult } from "@nseng-ai/pi/shared/exec-gateway";
import type { CommandContext } from "@nseng-ai/pi/runtime/extension-types";
import type { NotifyLevel, ToolDefinition } from "@nseng-ai/pi/runtime/tool-types";
import { makeErrorResult, makeFinalTextResult, toolContext } from "./helpers/fleet-testing.ts";
import { READ_ONLY_SUBAGENT_TOOLS } from "../src/runner-subagents/read-only-tools.ts";
import {
	createFunctionSubagentRuntime,
	createSubagentRuntimeRegistry,
	type SubagentRuntimeDispatchInput,
} from "../src/runtime/seam.ts";
import { createSubagentAgentRegistry } from "../src/agents/registry.ts";
import { SUBAGENT_FLEET_COMMAND_NAME } from "../src/fleet/contract.ts";
import { getOrCreateSubagentFleetRegistry } from "../src/fleet/provider.ts";
import { SubagentFleetRegistry } from "../src/fleet/registry.ts";
import packageExtension, { type NsPiSubagentsExtensionAPI } from "../src/extension.ts";
import {
	registerSubagentTool,
	SUBAGENT_TOOL_NAME,
	type SubagentToolHost,
} from "../src/tool/subagent.ts";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(packageRoot, "..", "package.json");

type BeforeAgentStartHandler = ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>;

class FakePi implements NsPiSubagentsExtensionAPI {
	readonly commands = new Map<
		string,
		{ handler(args: string, ctx: CommandContext): Promise<void> | void }
	>();
	readonly tools = new Map<string, ToolDefinition>();
	readonly beforeAgentStartHandlers: BeforeAgentStartHandler[] = [];

	getThinkingLevel(): "off" {
		return "off";
	}

	async exec(
		_command: string,
		_args: string[],
		_options?: RawPiExecOptions,
	): Promise<RawPiExecResult> {
		return { stdout: "", stderr: "", code: 0, killed: false };
	}
	registerCommand(
		name: string,
		command: { handler(args: string, ctx: CommandContext): Promise<void> | void },
	): void {
		this.commands.set(name, command);
	}
	registerTool(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition);
	}
	readonly on = ((event: string, handler: BeforeAgentStartHandler): void => {
		if (event === "before_agent_start") this.beforeAgentStartHandlers.push(handler);
	}) as ExtensionAPI["on"];
}

function definition(
	name: "explorer" | "task",
	overrides: Partial<PiAgentDefinition> = {},
): PiAgentDefinition {
	return {
		schema: PI_AGENT_DEFINITION_SCHEMA,
		name,
		toolName: SUBAGENT_TOOL_NAME,
		label: name,
		description: `${name} description`,
		promptGuidelines: [`Use subagent agent ${name}.`],
		delegationDoctrine: [`### subagent ${name}`],
		body: `Delegated {{prompt}}`,
		filePath: `/repo/.ns/pi/agents/${name}.md`,
		...overrides,
	};
}

function loader(name: string): PiAgentDefinition {
	if (name === "explorer" || name === "task") return definition(name);
	throw new Error(`unknown ${name}`);
}

function commandBackedToolHost(pi: FakePi): SubagentToolHost {
	return {
		...pi,
		registerTool: pi.registerTool.bind(pi),
		getThinkingLevel: pi.getThinkingLevel.bind(pi),
		exec: async () => ({ type: "exited", stdout: "", stderr: "", code: 0, signal: null }),
	};
}

function invokeBeforeAgentStart(
	handler: BeforeAgentStartHandler | undefined,
	systemPrompt: string,
): ReturnType<BeforeAgentStartHandler> {
	return handler?.(
		{
			type: "before_agent_start",
			prompt: "",
			systemPrompt,
			systemPromptOptions: { cwd: "/repo" },
		},
		// The registered handler does not consume extension context.
		undefined as never,
	);
}

function requireSyncSystemPrompt(result: ReturnType<BeforeAgentStartHandler>): string {
	if (result === undefined || "then" in result) throw new Error("Expected synchronous doctrine.");
	return result.systemPrompt ?? "";
}

describe("ns-pi-subagents package", () => {
	test("Pi manifest points at the extension entrypoint", () => {
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
			pi?: { extensions?: string[] };
		};
		const extensionPath = manifest.pi?.extensions?.[0];
		expect(extensionPath).toBe("./src/extension.ts");
		if (extensionPath === undefined) throw new Error("Missing Pi extension path.");
		expect(existsSync(join(packageRoot, "..", extensionPath))).toBe(true);
	});

	test("registers exactly one model-visible subagent tool plus fleet command", () => {
		const pi = new FakePi();
		packageExtension(pi, { cwd: "/repo", loadAgentDefinition: loader });
		expect([...pi.tools.keys()]).toEqual([SUBAGENT_TOOL_NAME]);
		expect(pi.tools.get(SUBAGENT_TOOL_NAME)?.parameters).toMatchObject({
			properties: { agent: { enum: ["explorer", "task"] } },
		});
		expect(pi.commands.has(SUBAGENT_FLEET_COMMAND_NAME)).toBe(true);
	});

	test("derives the model-visible parameters from the zod input schema", () => {
		const pi = new FakePi();
		packageExtension(pi, { cwd: "/repo", loadAgentDefinition: loader });
		expect(pi.tools.get(SUBAGENT_TOOL_NAME)?.parameters).toMatchObject({
			type: "object",
			required: ["agent", "tasks"],
			additionalProperties: false,
			properties: {
				agent: {
					type: "string",
					enum: ["explorer", "task"],
					description: "Registered behavioral agent policy.",
				},
				tasks: {
					type: "array",
					minItems: 1,
					items: {
						type: "object",
						required: ["title", "prompt"],
						additionalProperties: false,
						properties: {
							title: { type: "string", minLength: 1, maxLength: 200 },
							prompt: { type: "string", minLength: 1, maxLength: 50_000 },
						},
					},
				},
				execution: { type: "string", enum: ["auto", "subprocess", "in-process"] },
				model: { type: "string" },
			},
		});
	});

	test("dispatches task auto through subprocess and rejects unavailable in-process", async () => {
		const pi = new FakePi();
		const runtime = createFunctionSubagentRuntime(async (input) => ({
			status: "final-text",
			finalText: "done",
			elapsedMs: 1,
			progress: {
				...(input.options.title === undefined ? {} : { title: input.options.title }),
				state: "stopped",
				toolCount: 0,
				turnCount: 1,
				elapsedMs: 1,
			},
		}));
		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: loader,
			runtimeAdapters: [{ kind: "subprocess", create: () => ({ ok: true, runtime }) }],
		});
		const tool = pi.tools.get(SUBAGENT_TOOL_NAME);
		if (tool === undefined) throw new Error("Missing subagent tool.");
		const auto = await tool.execute(
			"call",
			{ agent: "task", tasks: [{ title: "Focused", prompt: "Inspect and report." }] },
			undefined,
			undefined,
			toolContext(),
		);
		expect(auto.content[0]?.text).toContain("done");
		expect(auto.details).toMatchObject({
			status: "completed",
			tasks: [{ agent: "task", execution: "subprocess", status: "final-text" }],
		});

		const unavailable = await tool.execute(
			"call",
			{
				agent: "task",
				tasks: [{ title: "Focused", prompt: "Inspect and report." }],
				execution: "in-process",
			},
			undefined,
			undefined,
			toolContext(),
		);
		expect(unavailable.details).toMatchObject({ status: "configuration-error" });
	});

	test("enforces descriptor task caps before launch", async () => {
		const pi = new FakePi();
		let dispatchCount = 0;
		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: loader,
			runtimeAdapters: [
				{
					kind: "subprocess",
					create: () => ({
						ok: true,
						runtime: createFunctionSubagentRuntime(async () => {
							dispatchCount += 1;
							throw new Error("must not launch");
						}),
					}),
				},
			],
		});
		const result = await pi.tools.get(SUBAGENT_TOOL_NAME)?.execute(
			"call",
			{
				agent: "task",
				tasks: [
					{ title: "one", prompt: "one" },
					{ title: "two", prompt: "two" },
				],
			},
			undefined,
			undefined,
			toolContext(),
		);
		expect(result?.details).toMatchObject({ status: "configuration-error" });
		expect(dispatchCount).toBe(0);
	});

	test("applies consumer descriptor policy through cheap model selection", async () => {
		const pi = new FakePi();
		const calls: SubagentRuntimeDispatchInput[] = [];
		const runtime = createFunctionSubagentRuntime(async (input) => {
			calls.push(input);
			return {
				status: "final-text",
				finalText: "consumer done",
				elapsedMs: 1,
				progress: { state: "stopped", toolCount: 0, turnCount: 1, elapsedMs: 1 },
			};
		});
		const consumerDefinition: PiAgentDefinition = {
			schema: PI_AGENT_DEFINITION_SCHEMA,
			name: "consumer-scout",
			toolName: SUBAGENT_TOOL_NAME,
			label: "Consumer scout",
			description: "Consumer descriptor regression fixture.",
			promptGuidelines: [],
			delegationDoctrine: [],
			body: "Consumer assignment: {{prompt}}",
			filePath: "/repo/.ns/pi/agents/consumer-scout.md",
		};
		const agents = createSubagentAgentRegistry(
			[
				{
					name: "consumer-scout",
					definitionPath: ".ns/pi/agents/consumer-scout.md",
					minTasks: 1,
					maxTasks: 1,
					maxConcurrency: 1,
					tools: ["read", "consumer_lookup"],
					promptContext: "curated-worktree",
					modelPolicy: "cheap-or-inherit",
					maxTaskFinalTextChars: 1_000,
					supportedRuntimes: ["subprocess"],
					runtimePreference: ["subprocess"],
				},
			],
			() => consumerDefinition,
		);
		registerSubagentTool(commandBackedToolHost(pi), {
			agents,
			fleetRegistry: new SubagentFleetRegistry(),
			loadAgentDefinition: () => consumerDefinition,
			runtimes: createSubagentRuntimeRegistry([
				{ kind: "subprocess", create: () => ({ ok: true, runtime }) },
			]),
		});

		const result = await pi.tools.get(SUBAGENT_TOOL_NAME)?.execute(
			"call",
			{
				agent: "consumer-scout",
				tasks: [{ title: "Inspect consumer", prompt: "Map the consumer seam." }],
				model: "anthropic/claude-haiku-4-5",
			},
			undefined,
			undefined,
			toolContext(),
		);

		expect(result?.details).toMatchObject({ status: "completed" });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.options.tools).toEqual(["read", "consumer_lookup"]);
		expect(calls[0]?.options.model).toBe("anthropic/claude-haiku-4-5");
		expect(calls[0]?.options.prompt).toContain("Consumer assignment: Map the consumer seam.");
		expect(calls[0]?.options.prompt).toContain("## Auto-curated context");
		expect(calls[0]?.options.prompt).toContain("Git evidence collected");
	});

	test("applies explorer permissions and attempts an explicit model once per task", async () => {
		const pi = new FakePi();
		const calls: SubagentRuntimeDispatchInput[] = [];
		const runtime = createFunctionSubagentRuntime(async (input) => {
			calls.push(input);
			return {
				status: "final-text",
				finalText: "scouted",
				elapsedMs: 1,
				progress: { state: "stopped", toolCount: 0, turnCount: 1, elapsedMs: 1 },
			};
		});
		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: loader,
			runtimeAdapters: [{ kind: "subprocess", create: () => ({ ok: true, runtime }) }],
		});
		const result = await pi.tools.get(SUBAGENT_TOOL_NAME)?.execute(
			"call",
			{
				agent: "explorer",
				tasks: [
					{ title: "one", prompt: "one" },
					{ title: "two", prompt: "two" },
				],
				model: "anthropic/claude-haiku-4-5",
			},
			undefined,
			undefined,
			toolContext(),
		);
		expect(result?.details).toMatchObject({ status: "completed" });
		const fleet = getOrCreateSubagentFleetRegistry(pi).snapshot();
		expect(fleet).toHaveLength(1);
		expect(fleet[0]?.tasks.map((task) => [task.index, task.title, task.finalStatus])).toEqual([
			[0, "one", "final-text"],
			[1, "two", "final-text"],
		]);
		expect(calls).toHaveLength(2);
		for (const call of calls) {
			expect(call.options.tools).toEqual(READ_ONLY_SUBAGENT_TOOLS);
			expect(call.options.model).toBe("anthropic/claude-haiku-4-5");
		}
	});

	test("ends an explorer task after one error attempt", async () => {
		const pi = new FakePi();
		const calls: SubagentRuntimeDispatchInput[] = [];
		const runtime = createFunctionSubagentRuntime(async (input) => {
			calls.push(input);
			return {
				status: "error",
				diagnostic: "launch failure",
				error: { message: "launch failure" },
				elapsedMs: 1,
				progress: { state: "stopped", toolCount: 0, turnCount: 0, elapsedMs: 1 },
			};
		});
		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: loader,
			runtimeAdapters: [{ kind: "subprocess", create: () => ({ ok: true, runtime }) }],
		});

		const result = await pi.tools.get(SUBAGENT_TOOL_NAME)?.execute(
			"call",
			{
				agent: "explorer",
				tasks: [{ title: "inspect once", prompt: "inspect" }],
				model: "anthropic/claude-haiku-4-5",
			},
			undefined,
			undefined,
			toolContext(),
		);

		expect(calls).toHaveLength(1);
		expect(result?.details).toMatchObject({
			status: "partial",
			tasks: [{ status: "error", diagnostic: "launch failure" }],
		});
		const fleet = getOrCreateSubagentFleetRegistry(pi).snapshot();
		expect(fleet).toHaveLength(1);
		expect(fleet[0]?.tasks).toMatchObject([
			{
				title: "inspect once",
				state: "done",
				finalStatus: "error",
			},
		]);
	});

	test("preserves cancelled positions when queued Fleet tasks never start", async () => {
		const pi = new FakePi();
		const controller = new AbortController();
		let dispatchCount = 0;
		const runtime = createFunctionSubagentRuntime(async (input) => {
			dispatchCount += 1;
			controller.abort("stop fan-out");
			return {
				status: "cancelled",
				diagnostic: "stop fan-out",
				reason: "stop fan-out",
				elapsedMs: 1,
				progress: {
					...(input.options.title === undefined ? {} : { title: input.options.title }),
					state: "stopped",
					toolCount: 0,
					turnCount: 0,
					elapsedMs: 1,
				},
			};
		});
		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: loader,
			runtimeAdapters: [{ kind: "subprocess", create: () => ({ ok: true, runtime }) }],
		});
		const tasks = Array.from({ length: 5 }, (_, index) => ({
			title: `task ${index}`,
			prompt: `inspect ${index}`,
		}));

		const result = await pi.tools
			.get(SUBAGENT_TOOL_NAME)
			?.execute(
				"call",
				{ agent: "explorer", tasks, model: "anthropic/claude-haiku-4-5" },
				controller.signal,
				undefined,
				toolContext(),
			);

		expect(dispatchCount).toBe(1);
		expect(result?.details).toMatchObject({
			status: "partial",
			tasks: tasks.map((task) => ({ title: task.title, status: "cancelled" })),
		});
		const fleetTasks = getOrCreateSubagentFleetRegistry(pi)
			.snapshot()
			.flatMap((run) => run.tasks);
		expect(fleetTasks.map((task) => [task.index, task.finalStatus])).toEqual(
			tasks.map((_, index) => [index, "cancelled"]),
		);
	});

	test("converts a thrown runtime dispatch into an error result without orphaning siblings", async () => {
		const pi = new FakePi();
		const runtime = createFunctionSubagentRuntime(async (input) => {
			if (input.options.title === "boom") throw new Error("dispatch exploded");
			return makeFinalTextResult("sibling done");
		});
		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: loader,
			runtimeAdapters: [{ kind: "subprocess", create: () => ({ ok: true, runtime }) }],
		});

		const result = await pi.tools.get(SUBAGENT_TOOL_NAME)?.execute(
			"call",
			{
				agent: "explorer",
				tasks: [
					{ title: "boom", prompt: "throw" },
					{ title: "steady", prompt: "succeed" },
				],
				model: "anthropic/claude-haiku-4-5",
			},
			undefined,
			undefined,
			toolContext(),
		);

		expect(result?.details).toMatchObject({
			status: "partial",
			tasks: [
				{ title: "boom", status: "error", diagnostic: "dispatch exploded" },
				{ title: "steady", status: "final-text", finalText: "sibling done" },
			],
		});
		const fleetTasks = getOrCreateSubagentFleetRegistry(pi)
			.snapshot()
			.flatMap((run) => run.tasks);
		expect(fleetTasks.map((task) => [task.index, task.state, task.finalStatus])).toEqual([
			[0, "done", "error"],
			[1, "done", "final-text"],
		]);
	});

	test("aborts the shared dispatch signal once the tool call resolves", async () => {
		const pi = new FakePi();
		const signals: AbortSignal[] = [];
		const runtime = createFunctionSubagentRuntime(async (input) => {
			if (input.options.signal !== undefined) signals.push(input.options.signal);
			return makeFinalTextResult("done");
		});
		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: loader,
			runtimeAdapters: [{ kind: "subprocess", create: () => ({ ok: true, runtime }) }],
		});

		const result = await pi.tools
			.get(SUBAGENT_TOOL_NAME)
			?.execute(
				"call",
				{ agent: "task", tasks: [{ title: "Focused", prompt: "Inspect." }] },
				undefined,
				undefined,
				toolContext(),
			);

		expect(result?.details).toMatchObject({ status: "completed" });
		expect(signals).toHaveLength(1);
		expect(signals[0]?.aborted).toBe(true);
		expect(signals[0]?.reason).toBe("subagent call ended");
	});

	test("notifies the host UI once when a batch ends abnormally", async () => {
		const pi = new FakePi();
		const runtime = createFunctionSubagentRuntime(async (input) => {
			if (input.options.title === "two") return makeErrorResult("launch failure");
			return makeFinalTextResult("done");
		});
		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: loader,
			runtimeAdapters: [{ kind: "subprocess", create: () => ({ ok: true, runtime }) }],
		});
		const notifications: Array<[string, NotifyLevel | undefined]> = [];

		const result = await pi.tools.get(SUBAGENT_TOOL_NAME)?.execute(
			"call",
			{
				agent: "explorer",
				tasks: [
					{ title: "one", prompt: "one" },
					{ title: "two", prompt: "two" },
				],
				model: "anthropic/claude-haiku-4-5",
			},
			undefined,
			undefined,
			toolContext({ notify: (message, level) => notifications.push([message, level]) }),
		);

		expect(result?.details).toMatchObject({ status: "partial" });
		expect(notifications).toEqual([["subagent: 1/2 explorer task(s) did not complete", "warning"]]);
	});

	test("does not notify on full success or configuration errors", async () => {
		const pi = new FakePi();
		const runtime = createFunctionSubagentRuntime(async () => makeFinalTextResult("done"));
		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: loader,
			runtimeAdapters: [{ kind: "subprocess", create: () => ({ ok: true, runtime }) }],
		});
		const notifications: string[] = [];
		const ctx = toolContext({ notify: (message) => notifications.push(message) });
		const tool = pi.tools.get(SUBAGENT_TOOL_NAME);

		const success = await tool?.execute(
			"call",
			{ agent: "task", tasks: [{ title: "Focused", prompt: "Inspect." }] },
			undefined,
			undefined,
			ctx,
		);
		expect(success?.details).toMatchObject({ status: "completed" });

		const configurationError = await tool?.execute(
			"call",
			{
				agent: "task",
				tasks: [
					{ title: "one", prompt: "one" },
					{ title: "two", prompt: "two" },
				],
			},
			undefined,
			undefined,
			ctx,
		);
		expect(configurationError?.details).toMatchObject({ status: "configuration-error" });
		expect(notifications).toEqual([]);
	});

	test("assembles healthy agent doctrine deterministically", () => {
		const pi = new FakePi();
		packageExtension(pi, { cwd: "/repo", loadAgentDefinition: loader });
		expect(pi.beforeAgentStartHandlers).toHaveLength(1);
		const prompt = requireSyncSystemPrompt(
			invokeBeforeAgentStart(pi.beforeAgentStartHandlers[0], "BASE"),
		);
		expect(prompt).toContain("### subagent explorer");
		expect(prompt).toContain("### subagent task");
	});

	test("degrades one unhealthy catalog entry without suppressing the unified tool", () => {
		const pi = new FakePi();
		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: (name) =>
				name === "explorer" ? definition("explorer", { toolName: "wrong" }) : definition("task"),
		});
		expect([...pi.tools.keys()]).toEqual([SUBAGENT_TOOL_NAME]);
		const prompt = requireSyncSystemPrompt(
			invokeBeforeAgentStart(pi.beforeAgentStartHandlers[0], "BASE"),
		);
		expect(prompt).not.toContain("subagent explorer");
		expect(prompt).toContain("subagent task");
	});
});
