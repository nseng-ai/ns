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
import packageExtension from "../src/extension.ts";
import { EXPLORE_TOOL_NAME, EXPLORER_AGENT_NAME } from "../src/explore/contract.ts";
import {
	makeExplorerAgentDefinition,
	makePerAgentDefinitionLoader,
	makeRunnerAgentDefinition,
} from "./helpers/explore-testing.ts";
import { SUBAGENT_FLEET_COMMAND_NAME } from "../src/fleet/contract.ts";
import type { NsPiSubagentsExtensionAPI } from "../src/extension.ts";
import type { CommandContext } from "@nseng-ai/pi/runtime/extension-types";
import type { ToolDefinition } from "@nseng-ai/pi/runtime/tool-types";
import { FORKED_PI_AGENT_TOOL_NAME, RUNNER_AGENT_NAME } from "../src/runner-subagents/extension.ts";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(packageRoot, "..", "package.json");

type BeforeAgentStartHandler = ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>;

class FakePiBase {
	readonly commands = new Map<
		string,
		{ handler(args: string, ctx: CommandContext): Promise<void> | void }
	>();
	readonly tools = new Map<string, ToolDefinition>();

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
}

class FakePi extends FakePiBase implements NsPiSubagentsExtensionAPI {
	readonly beforeAgentStartHandlers: BeforeAgentStartHandler[] = [];

	readonly on = ((event: string, handler: BeforeAgentStartHandler): void => {
		if (event === "before_agent_start") this.beforeAgentStartHandlers.push(handler);
	}) as ExtensionAPI["on"];
}

function agentDefinitionLoader(
	overrides: {
		explore?: Parameters<typeof makeExplorerAgentDefinition>[0];
		runner?: Parameters<typeof makeRunnerAgentDefinition>[0];
	} = {},
): (agentName: string) => ReturnType<typeof makeExplorerAgentDefinition> {
	return makePerAgentDefinitionLoader(
		new Map([
			[EXPLORER_AGENT_NAME, makeExplorerAgentDefinition(overrides.explore)],
			[RUNNER_AGENT_NAME, makeRunnerAgentDefinition(overrides.runner)],
		]),
	);
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
	test("Pi manifest points directly at the unified subagents extension entrypoint", () => {
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
			pi?: { extensions?: string[] };
		};
		const extensionPath = manifest.pi?.extensions?.[0];

		expect(extensionPath).toBe("./src/extension.ts");
		if (extensionPath === undefined) throw new Error("Missing Pi extension path.");
		expect(existsSync(join(packageRoot, "..", extensionPath))).toBe(true);
	});

	test("package extension entrypoint registers tools and agents commands", () => {
		const pi = new FakePi();

		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: () => makeExplorerAgentDefinition(),
		});

		expect(pi.tools.has(EXPLORE_TOOL_NAME)).toBe(true);
		expect(pi.tools.has(FORKED_PI_AGENT_TOOL_NAME)).toBe(true);
		expect(pi.commands.has(SUBAGENT_FLEET_COMMAND_NAME)).toBe(true);
		expect([...pi.commands.keys()]).toEqual([SUBAGENT_FLEET_COMMAND_NAME]);
		expect(pi.commands.has("ns:subagents:fleet")).toBe(false);
		expect(pi.commands.has("ns:explore:transcript")).toBe(false);
	});

	test("injects both healthy doctrine subsections before agent start", () => {
		const pi = new FakePi();

		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: agentDefinitionLoader(),
		});

		expect(pi.beforeAgentStartHandlers).toHaveLength(1);
		const systemPrompt = requireSyncSystemPrompt(
			invokeBeforeAgentStart(pi.beforeAgentStartHandlers[0], "BASE"),
		);
		expect(systemPrompt).toContain("### `explore` — parallel read-only scouts");
		expect(systemPrompt).toContain("### `forked_pi_agent` — focused forked Pi process");
		expect(systemPrompt.startsWith("BASE\n\n")).toBe(true);
	});

	test("injects forked_pi_agent doctrine only when explorer registration is degraded", () => {
		const pi = new FakePi();
		const loader = agentDefinitionLoader({ explore: { toolName: "broken_explore" } });

		packageExtension(pi, { cwd: "/repo", loadAgentDefinition: loader });

		expect(pi.beforeAgentStartHandlers).toHaveLength(1);
		const systemPrompt = requireSyncSystemPrompt(
			invokeBeforeAgentStart(pi.beforeAgentStartHandlers[0], "BASE"),
		);
		expect(systemPrompt).not.toContain("### `explore`");
		expect(systemPrompt).toContain("### `forked_pi_agent` — focused forked Pi process");
	});

	test("injects explore doctrine only when runner registration is degraded", () => {
		const pi = new FakePi();

		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: () => makeExplorerAgentDefinition(),
		});

		expect(pi.beforeAgentStartHandlers).toHaveLength(1);
		const systemPrompt = requireSyncSystemPrompt(
			invokeBeforeAgentStart(pi.beforeAgentStartHandlers[0], "BASE"),
		);
		expect(systemPrompt).toContain("### `explore` — parallel read-only scouts");
		expect(systemPrompt).not.toContain("### `forked_pi_agent`");
	});

	test("omits doctrine when both built-in tools are degraded but still registers fallback tools", () => {
		const pi = new FakePi();
		const loader = agentDefinitionLoader({
			explore: { toolName: "broken_explore" },
			runner: { toolName: "broken_runner" },
		});

		packageExtension(pi, { cwd: "/repo", loadAgentDefinition: loader });

		expect(pi.beforeAgentStartHandlers).toHaveLength(0);
		expect(pi.tools.has(EXPLORE_TOOL_NAME)).toBe(true);
		expect(pi.tools.has(FORKED_PI_AGENT_TOOL_NAME)).toBe(true);
	});

	test("doctrine injection is deterministic across fresh extension registrations", () => {
		const firstPi = new FakePi();
		const secondPi = new FakePi();
		packageExtension(firstPi, {
			cwd: "/repo",
			loadAgentDefinition: agentDefinitionLoader(),
		});
		packageExtension(secondPi, {
			cwd: "/repo",
			loadAgentDefinition: agentDefinitionLoader(),
		});

		const first = requireSyncSystemPrompt(
			invokeBeforeAgentStart(firstPi.beforeAgentStartHandlers[0], "BASE"),
		);
		const second = requireSyncSystemPrompt(
			invokeBeforeAgentStart(secondPi.beforeAgentStartHandlers[0], "BASE"),
		);
		expect(first).toBe(second);
	});
});
