import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { loadNsCommandCatalog, loadSelectedNsCommand } from "../../src/extensions/registry.ts";
import {
	createExtensionRegistryWorkspace,
	writeWorkspaceFile,
} from "../helpers/extension-workspace.ts";

describe("extension registry descriptor loading", () => {
	test("declared ns-command from a duplicate SDK install loads without relaxing malformed validation", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const packageRoot = workspace.cwd + "/extensions/tools";
		writeWorkspaceFile(workspace.cwd + "/ns.toml", 'extensions = ["./extensions/tools"]\n');
		writeWorkspaceFile(
			packageRoot + "/package.json",
			JSON.stringify({
				name: "tools",
				version: "1.0.0",
				type: "module",
				exports: { "./ns-extension": "./src/ns/extension.ts" },
			}),
		);
		writeWorkspaceFile(
			packageRoot + "/src/ns/extension.ts",
			`import { defineExtension } from "@nseng-ai/sdk";
export default defineExtension({
	description: "Project tools.",
	entries: [
		{ kind: "ns-command", name: "valid", load: async () => await import("../commands/valid.ts") },
		{ kind: "ns-command", name: "malformed", load: async () => await import("../commands/malformed.ts") },
	],
});
`,
		);
		const duplicateSdkRoot = packageRoot + "/node_modules/@nseng-ai/sdk";
		writeWorkspaceFile(
			duplicateSdkRoot + "/package.json",
			JSON.stringify({ name: "@nseng-ai/sdk", version: "99.0.0", type: "module" }),
		);
		writeWorkspaceFile(
			duplicateSdkRoot + "/index.js",
			`export { z } from "zod";
export function defineCommand(options) {
	return { ...options, description: options.description ?? options.summary };
}
`,
		);
		cpSync(
			fileURLToPath(new URL("../../node_modules/zod", import.meta.url)),
			packageRoot + "/node_modules/zod",
			{ recursive: true, dereference: true },
		);
		writeWorkspaceFile(
			packageRoot + "/src/commands/valid.ts",
			`import { defineCommand, z } from "../../node_modules/@nseng-ai/sdk/index.js";
export default defineCommand({
	name: "valid",
	summary: "Valid duplicate command.",
	schema: z.object({ value: z.string() }),
	resultSchema: z.string(),
	handler: () => ({ type: "ok", data: "valid" }),
});
`,
		);
		writeWorkspaceFile(
			packageRoot + "/src/commands/malformed.ts",
			`import { defineCommand, z } from "../../node_modules/@nseng-ai/sdk/index.js";
export default defineCommand({
	name: "malformed",
	summary: "Malformed duplicate command.",
	schema: z.string(),
	resultSchema: z.string(),
	handler: () => ({ type: "ok", data: "malformed" }),
});
`,
		);

		const catalog = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});
		const validCandidate = catalog.candidates.get("valid");
		const malformedCandidate = catalog.candidates.get("malformed");
		if (validCandidate === undefined || malformedCandidate === undefined) {
			throw new Error("Expected both duplicate-SDK command candidates.");
		}

		const valid = await loadSelectedNsCommand(validCandidate);
		expect(valid.ok).toBe(true);
		if (valid.ok) {
			expect(valid.loaded).toMatchObject({ kind: "ns-command", command: { name: "valid" } });
		}

		const malformed = await loadSelectedNsCommand(malformedCandidate);
		expect(malformed.ok).toBe(false);
		if (!malformed.ok) {
			expect(malformed.diagnostic.code).toBe("extension_command_invalid");
			expect(malformed.diagnostic.message).toContain("declared ns-command module");
		}
	});

	test("descriptor package module reference loads selected command", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeWorkspaceFile(workspace.cwd + "/ns.toml", 'extensions = ["./extensions/tools"]\n');
		writeWorkspaceFile(
			workspace.cwd + "/extensions/tools/package.json",
			JSON.stringify({
				name: "tools",
				version: "1.0.0",
				type: "module",
				exports: { "./ns-extension": "./src/ns/extension.ts" },
			}),
		);
		writeWorkspaceFile(
			workspace.cwd + "/extensions/tools/src/ns/extension.ts",
			`import { defineExtension } from "@nseng-ai/sdk";
export default defineExtension({
	description: "Project tools.",
	entries: [{ kind: "raw-command", name: "list", load: async () => await import("../commands/list.ts") }],
});
`,
		);
		writeWorkspaceFile(
			workspace.cwd + "/extensions/tools/src/commands/list.ts",
			`import { defineRawCommand, ok } from "@nseng-ai/sdk";
export default defineRawCommand({
	name: "list",
	summary: "List project tools.",
	description: "List project tools.",
	run: () => ok({}),
});
`,
		);

		const catalog = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});
		const candidate = catalog.candidates.get("list");
		if (candidate === undefined || !("moduleReference" in candidate)) {
			throw new Error("Expected descriptor package candidate.");
		}
		expect(candidate.moduleReference.type).toBe("loaded");

		const selected = await loadSelectedNsCommand(candidate);
		expect(selected.ok).toBe(true);
		if (!selected.ok) return;
		expect(selected.loaded).toMatchObject({ kind: "raw-command", command: { name: "list" } });
	});
});
