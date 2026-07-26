import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCliWithFakes } from "./ns-cli-fakes.ts";
import {
	createExtensionRegistryWorkspace,
	writeWorkspaceFile,
} from "../helpers/extension-workspace.ts";

function descriptorCommandModule(name: string, message: string): string {
	return `
import { defineRawCommand, ok } from "@nseng-ai/sdk";

export default defineRawCommand({
	name: ${JSON.stringify(name)},
	summary: ${JSON.stringify(`${name} summary`)},
	description: ${JSON.stringify(`${name} command`)},
	run() { return ok({ message: ${JSON.stringify(message)} }); },
});
`;
}

describe("descriptor extension CLI routing", () => {
	test("routes ns.toml-declared descriptor commands", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeWorkspaceFile(join(workspace.cwd, "ns.toml"), 'extensions = ["./extensions/tools"]\n');
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "tools", "package.json"),
			JSON.stringify({
				name: "tools",
				version: "1.0.0",
				exports: { "./ns-extension": "./src/ns/extension.ts" },
			}),
		);
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "tools", "src", "ns", "extension.ts"),
			`
import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	group: "tools",
	description: "Tool commands.",
	entries: [{ name: "scan", load: () => import("../commands/scan.ts") }],
});
`,
		);
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "tools", "src", "commands", "scan.ts"),
			descriptorCommandModule("scan", "scanned"),
		);

		const run = runCliWithFakes(
			{
				args: ["tools", "scan", "--format", "json"],
				cwd: workspace.cwd,
				homeDir: workspace.homeDir,
			},
			{ execResponses: () => [], textGenerationResults: () => [] },
		);

		expect(await run.exit).toBe(0);
		expect(run.stderr).toEqual([]);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			status: "ok",
			data: { message: "scanned" },
		});
	});

	test("mounts filesystem descriptor commands with invocation-owned extension context", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const packageRoot = join(workspace.cwd, "extensions", "tools");
		const commandDirectory = join(packageRoot, "src", "commands");
		writeWorkspaceFile(join(workspace.cwd, "ns.toml"), 'extensions = ["./extensions/tools"]\n');
		writeWorkspaceFile(
			join(packageRoot, "package.json"),
			JSON.stringify({
				name: "tools",
				version: "1.0.0",
				exports: { "./ns-extension": "./src/ns-extension.ts" },
			}),
		);
		writeWorkspaceFile(
			join(packageRoot, "src", "ns-extension.ts"),
			`
import { defineExtension } from "@nseng-ai/sdk";
export default defineExtension({
  description: "Tool commands.",
  commandDirectory: ${JSON.stringify(commandDirectory)},
});
`,
		);
		writeWorkspaceFile(
			join(commandDirectory, "tools", "group.ts"),
			`export function group() { return { description: "Tool commands." }; }\n`,
		);
		writeWorkspaceFile(
			join(commandDirectory, "tools", "scan", "command.ts"),
			`
import { defineCommand } from ${JSON.stringify(
				join(import.meta.dirname, "../../../infra/clinkr/src/index.ts"),
			)};
import { z } from ${JSON.stringify(join(import.meta.dirname, "../../node_modules/zod/index.js"))};
export function metadata() { return { summary: "Scan.", description: "Scan with context." }; }
export function command() { return defineCommand({
  schema: z.object({}),
  resultSchema: z.object({ cwd: z.string() }),
  handler: async (ctx) => ({ type: "ok", data: { cwd: ctx.cwd } }),
}); }
`,
		);

		const run = runCliWithFakes(
			{
				args: ["tools", "scan", "--format", "json"],
				cwd: workspace.cwd,
				homeDir: workspace.homeDir,
			},
			{ execResponses: () => [], textGenerationResults: () => [] },
		);

		expect(await run.exit).toBe(0);
		expect(run.stderr).toEqual([]);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			status: "ok",
			data: { cwd: workspace.cwd },
		});
	});

	test("does not infer aliases for descriptor list commands", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeWorkspaceFile(join(workspace.cwd, "ns.toml"), 'extensions = ["./extensions/tools"]\n');
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "tools", "package.json"),
			JSON.stringify({
				name: "tools",
				version: "1.0.0",
				exports: { "./ns-extension": "./src/ns/extension.ts" },
			}),
		);
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "tools", "src", "ns", "extension.ts"),
			`
import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	group: "tools",
	description: "Tool commands.",
	entries: [{ name: "list", load: () => import("../commands/list.ts") }],
});
`,
		);
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "tools", "src", "commands", "list.ts"),
			descriptorCommandModule("list", "listed"),
		);

		const run = runCliWithFakes(
			{
				args: ["tools", "ls", "--format", "json"],
				cwd: workspace.cwd,
				homeDir: workspace.homeDir,
			},
			{ execResponses: () => [], textGenerationResults: () => [] },
		);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("unknown command 'ls'");
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({ status: "usageError", exitCode: 2 });
	});

	test("routes an explicitly declared ls command", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeWorkspaceFile(join(workspace.cwd, "ns.toml"), 'extensions = ["./extensions/tools"]\n');
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "tools", "package.json"),
			JSON.stringify({
				name: "tools",
				version: "1.0.0",
				exports: { "./ns-extension": "./src/ns/extension.ts" },
			}),
		);
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "tools", "src", "ns", "extension.ts"),
			`
import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	group: "tools",
	description: "Tool commands.",
	entries: [
		{ name: "list", load: () => import("../commands/list.ts") },
		{ name: "ls", load: () => import("../commands/ls.ts") },
	],
});
`,
		);
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "tools", "src", "commands", "list.ts"),
			descriptorCommandModule("list", "listed"),
		);
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "tools", "src", "commands", "ls.ts"),
			descriptorCommandModule("ls", "explicit ls"),
		);

		const run = runCliWithFakes(
			{
				args: ["tools", "ls", "--format", "json"],
				cwd: workspace.cwd,
				homeDir: workspace.homeDir,
			},
			{ execResponses: () => [], textGenerationResults: () => [] },
		);

		expect(await run.exit).toBe(0);
		expect(run.stderr).toEqual([]);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			status: "ok",
			data: { message: "explicit ls" },
		});
	});
});
