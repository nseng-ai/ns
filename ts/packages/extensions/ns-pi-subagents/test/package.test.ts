import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import packageExtension from "../src/extension.ts";
import { EXPLORE_TOOL_NAME } from "../src/explore/contract.ts";
import { makeExplorerAgentDefinition } from "./helpers/explore-testing.ts";
import { SUBAGENT_FLEET_COMMAND_NAME } from "../src/fleet/contract.ts";
import type { NsPiSubagentsExtensionAPI } from "../src/extension.ts";
import type { CommandContext } from "@nseng-ai/pi/runtime/extension-types";
import type { ToolDefinition } from "@nseng-ai/pi/runtime/tool-types";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(packageRoot, "..", "package.json");

class FakePi implements NsPiSubagentsExtensionAPI {
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
		expect(pi.tools.has("dispatch_runner_subagent")).toBe(true);
		expect(pi.commands.has(SUBAGENT_FLEET_COMMAND_NAME)).toBe(true);
		expect([...pi.commands.keys()]).toEqual([SUBAGENT_FLEET_COMMAND_NAME]);
		expect(pi.commands.has("ns:subagents:fleet")).toBe(false);
		expect(pi.commands.has("ns:explore:transcript")).toBe(false);
	});
});
