import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import packageExtension from "../src/extension.ts";
import { EXPLORE_TOOL_NAME } from "../src/explore/contract.ts";
import { makeExplorerAgentDefinition } from "../src/explore/testing.ts";
import type { NsPiSubagentsExtensionAPI } from "../src/extension.ts";
import type { ToolDefinition } from "@nseng-ai/pi/runtime/tool-types";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(packageRoot, "..", "package.json");

class FakePi implements NsPiSubagentsExtensionAPI {
	readonly tools = new Map<string, ToolDefinition>();

	async exec(_command: string, _args: string[], _options?: ExecOptions): Promise<ExecResult> {
		return { stdout: "", stderr: "", code: 0, killed: false };
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

	test("package extension entrypoint registers explore and dispatch_runner_subagent", () => {
		const pi = new FakePi();

		packageExtension(pi, {
			cwd: "/repo",
			loadAgentDefinition: () => makeExplorerAgentDefinition(),
		});

		expect(pi.tools.has(EXPLORE_TOOL_NAME)).toBe(true);
		expect(pi.tools.has("dispatch_runner_subagent")).toBe(true);
	});
});
