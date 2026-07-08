import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import packageExtension from "../src/extension.ts";
import { EXPLORE_TOOL_NAME, EXPLORER_AGENT_NAME } from "../src/explore/contract.ts";
import {
	makeExplorerAgentDefinition,
	makePerAgentDefinitionLoader,
	makeRunnerAgentDefinition,
} from "./helpers/explore-testing.ts";
import { SUBAGENT_FLEET_COMMAND_NAME } from "../src/fleet/contract.ts";
import type { BeforeAgentStartHandler, NsPiSubagentsExtensionAPI } from "../src/extension.ts";
import type { CommandContext } from "@nseng-ai/pi/runtime/extension-types";
import type { ToolDefinition } from "@nseng-ai/pi/runtime/tool-types";
import { FORKED_PI_AGENT_TOOL_NAME, RUNNER_AGENT_NAME } from "../src/runner-subagents/extension.ts";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(packageRoot, "..", "package.json");

class FakePiBase implements NsPiSubagentsExtensionAPI {
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

class FakePi extends FakePiBase {
	readonly beforeAgentStartHandlers: BeforeAgentStartHandler[] = [];

	on(_event: "before_agent_start", handler: BeforeAgentStartHandler): void {
		this.beforeAgentStartHandlers.push(handler);
	}
}

class OnlessFakePi extends FakePiBase {}

function healthyAgentDefinitionLoader(): (
	agentName: string,
) => ReturnType<typeof makeExplorerAgentDefinition> {
	return makePerAgentDefinitionLoader(
		new Map([
			[EXPLORER_AGENT_NAME, makeExplorerAgentDefinition()],
			[RUNNER_AGENT_NAME, makeRunnerAgentDefinition()],
		]),
	);
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
			loadAgentDefinition: healthyAgentDefinitionLoader(),
		});

		expect(pi.beforeAgentStartHandlers).toHaveLength(1);
		const result = pi.beforeAgentStartHandlers[0]?.({ systemPrompt: "BASE" });
		expect(result).toMatchObject({
			systemPrompt: expect.stringContaining("### `explore` — parallel read-only scouts"),
		});
		expect(result).toMatchObject({
			systemPrompt: expect.stringContaining("### `forked_pi_agent` — focused forked Pi process"),
		});
		if (result === undefined || "then" in result) throw new Error("Expected synchronous doctrine.");
		expect(result.systemPrompt.startsWith("BASE\n\n")).toBe(true);
	});

	test("injects forked_pi_agent doctrine only when explorer registration is degraded", () => {
		const pi = new FakePi();
		const loader = makePerAgentDefinitionLoader(
			new Map([
				[EXPLORER_AGENT_NAME, makeExplorerAgentDefinition({ toolName: "broken_explore" })],
				[RUNNER_AGENT_NAME, makeRunnerAgentDefinition()],
			]),
		);

		packageExtension(pi, { cwd: "/repo", loadAgentDefinition: loader });

		expect(pi.beforeAgentStartHandlers).toHaveLength(1);
		const result = pi.beforeAgentStartHandlers[0]?.({ systemPrompt: "BASE" });
		if (result === undefined || "then" in result) throw new Error("Expected synchronous doctrine.");
		expect(result.systemPrompt).not.toContain("### `explore`");
		expect(result.systemPrompt).toContain("### `forked_pi_agent` — focused forked Pi process");
	});

	test("injects explore doctrine only when runner registration is degraded", () => {
		const pi = new FakePi();

		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: () => makeExplorerAgentDefinition(),
		});

		expect(pi.beforeAgentStartHandlers).toHaveLength(1);
		const result = pi.beforeAgentStartHandlers[0]?.({ systemPrompt: "BASE" });
		if (result === undefined || "then" in result) throw new Error("Expected synchronous doctrine.");
		expect(result.systemPrompt).toContain("### `explore` — parallel read-only scouts");
		expect(result.systemPrompt).not.toContain("### `forked_pi_agent`");
	});

	test("omits doctrine when both built-in tools are degraded but still registers fallback tools", () => {
		const pi = new FakePi();
		const loader = makePerAgentDefinitionLoader(
			new Map([
				[EXPLORER_AGENT_NAME, makeExplorerAgentDefinition({ toolName: "broken_explore" })],
				[RUNNER_AGENT_NAME, makeRunnerAgentDefinition({ toolName: "broken_runner" })],
			]),
		);

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
			loadAgentDefinition: healthyAgentDefinitionLoader(),
		});
		packageExtension(secondPi, {
			cwd: "/repo",
			loadAgentDefinition: healthyAgentDefinitionLoader(),
		});

		const first = firstPi.beforeAgentStartHandlers[0]?.({ systemPrompt: "BASE" });
		const second = secondPi.beforeAgentStartHandlers[0]?.({ systemPrompt: "BASE" });
		if (first === undefined || "then" in first) throw new Error("Expected synchronous doctrine.");
		if (second === undefined || "then" in second) throw new Error("Expected synchronous doctrine.");
		expect(first.systemPrompt).toBe(second.systemPrompt);
	});

	test("on-less hosts still register tools and commands", () => {
		const pi = new OnlessFakePi();

		packageExtension(pi, { cwd: "/repo", loadAgentDefinition: healthyAgentDefinitionLoader() });

		expect(pi.tools.has(EXPLORE_TOOL_NAME)).toBe(true);
		expect(pi.tools.has(FORKED_PI_AGENT_TOOL_NAME)).toBe(true);
		expect(pi.commands.has(SUBAGENT_FLEET_COMMAND_NAME)).toBe(true);
	});
});
