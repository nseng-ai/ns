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
import type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import {
	PI_AGENT_DEFINITION_SCHEMA,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";
import type { CommandContext } from "@nseng-ai/pi/runtime/extension-types";
import type { ToolContext, ToolDefinition } from "@nseng-ai/pi/runtime/tool-types";
import { READ_ONLY_SUBAGENT_TOOLS } from "../src/runner-subagents/read-only-tools.ts";
import {
	createFunctionSubagentRuntime,
	type SubagentRuntimeDispatchInput,
} from "../src/runtime/seam.ts";
import { SUBAGENT_FLEET_COMMAND_NAME } from "../src/fleet/contract.ts";
import packageExtension, { type NsPiSubagentsExtensionAPI } from "../src/extension.ts";
import { SUBAGENT_TOOL_NAME } from "../src/tool/subagent.ts";

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

	async exec(_command: string, _args: string[], _options?: ExecOptions): Promise<ExecResult> {
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

function toolContext(): ToolContext {
	return {
		cwd: "/repo",
		mode: "tui",
		hasUI: false,
		ui: { notify: () => {} },
		model: { provider: "anthropic", id: "claude-sonnet-4-5" },
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
			runtimeAdapters: () => [{ kind: "subprocess", create: () => runtime }],
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
			runtimeAdapters: () => [
				{
					kind: "subprocess",
					create: () =>
						createFunctionSubagentRuntime(async () => {
							dispatchCount += 1;
							throw new Error("must not launch");
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
			runtimeAdapters: () => [{ kind: "subprocess", create: () => runtime }],
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
		expect(calls).toHaveLength(2);
		for (const call of calls) {
			expect(call.options.tools).toEqual(READ_ONLY_SUBAGENT_TOOLS);
			expect(call.options.model).toBe("anthropic/claude-haiku-4-5");
		}
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
