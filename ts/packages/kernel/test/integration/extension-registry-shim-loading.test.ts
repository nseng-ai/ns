import { describe, expect, test } from "vitest";

import { loadNsCommandCatalog, loadSelectedNsCommand } from "../../src/extensions/registry.ts";
import {
	createExtensionRegistryWorkspace,
	writeProjectExtension,
} from "../helpers/extension-workspace.ts";

describe("extension registry shim loading", () => {
	test("default re-export shim package module reference loads selected command", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeProjectExtension(
			workspace,
			"list.ts",
			'export { default } from "@nseng-ai/objectives/ns/commands/list";\n',
		);

		const catalog = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});
		const candidate = catalog.candidates.get("list");
		expect(candidate).toMatchObject({
			moduleReference: { type: "package", specifier: "@nseng-ai/objectives/ns/commands/list" },
		});
		if (candidate === undefined) return;

		const selected = await loadSelectedNsCommand(candidate);
		expect(selected.ok).toBe(true);
		if (!selected.ok) return;
		expect(selected.command.name).toBe("list");
	});
});
