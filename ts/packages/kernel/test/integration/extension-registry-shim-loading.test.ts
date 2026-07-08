import { describe, expect, test } from "vitest";

import { loadNsCommandCatalog, loadSelectedNsCommand } from "../../src/extensions/registry.ts";
import {
	createExtensionRegistryWorkspace,
	writeWorkspaceFile,
} from "../helpers/extension-workspace.ts";

describe("extension registry descriptor loading", () => {
	test("descriptor package module reference loads selected command", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeWorkspaceFile(workspace.cwd + "/ns.toml", 'extensions = ["./extensions/tools"]\n');
		writeWorkspaceFile(
			workspace.cwd + "/extensions/tools/package.json",
			JSON.stringify({
				name: "tools",
				type: "module",
				exports: { "./ns-extension": "./src/ns/extension.ts" },
			}),
		);
		writeWorkspaceFile(
			workspace.cwd + "/extensions/tools/src/ns/extension.ts",
			`import { defineExtension } from "@nseng-ai/kernel/sdk";
export default defineExtension({
	description: "Project tools.",
	entries: [{ name: "list", load: async () => await import("../commands/list.ts") }],
});
`,
		);
		writeWorkspaceFile(
			workspace.cwd + "/extensions/tools/src/commands/list.ts",
			`import { defineRawCommand, ok } from "@nseng-ai/kernel/sdk";
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
		expect(selected.command.name).toBe("list");
	});
});
