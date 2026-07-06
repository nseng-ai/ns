import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadNsCommandCatalog, loadSelectedNsCommand } from "../../src/extensions/registry.ts";

const tempDirs: string[] = [];

interface Workspace {
	cwd: string;
	homeDir: string;
}

async function createWorkspace(): Promise<Workspace> {
	const directory = await mkdtemp(join(tmpdir(), "ns-extension-registry-shim-loading-"));
	tempDirs.push(directory);
	return { cwd: join(directory, "project"), homeDir: join(directory, "home") };
}

function writeProjectExtension(workspace: Workspace, fileName: string, source: string): void {
	writeFile(join(workspace.cwd, ".ns", "extensions", fileName), source);
}

function writeFile(path: string, source: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source);
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("extension registry shim loading", () => {
	test("default re-export shim package module reference loads selected command", async () => {
		const workspace = await createWorkspace();
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
