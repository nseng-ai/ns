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
	entries: [{ kind: "raw-command", name: "scan", load: () => import("../commands/scan.ts") }],
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

	test("routes ls as an alias for descriptor list commands before loading", async () => {
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
	entries: [{ kind: "raw-command", name: "list", load: () => import("../commands/list.ts") }],
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

		expect(await run.exit).toBe(0);
		expect(run.stderr).toEqual([]);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			status: "ok",
			data: { message: "listed" },
		});
	});

	test("does not route ls as a list alias when a sibling ls command exists", async () => {
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
		{ kind: "raw-command", name: "list", load: () => import("../commands/list.ts") },
		{ kind: "raw-command", name: "ls", load: () => import("../commands/ls.ts") },
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
