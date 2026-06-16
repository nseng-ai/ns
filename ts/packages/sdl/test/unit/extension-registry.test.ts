import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { hasExtensionErrors, loadSdlCommandCatalog, loadSelectedSdlCommand } from "../../src/extension-registry.ts";

const tempDirs: string[] = [];

interface Workspace {
	cwd: string;
	homeDir: string;
}

async function createWorkspace(): Promise<Workspace> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-extension-registry-"));
	tempDirs.push(directory);
	return { cwd: join(directory, "project"), homeDir: join(directory, "home") };
}

function writeProjectExtension(workspace: Workspace, fileName: string, source: string): void {
	writeFile(join(workspace.cwd, ".asdl", "extensions", fileName), source);
}

function writeGlobalExtension(workspace: Workspace, fileName: string, source: string): void {
	writeFile(join(workspace.homeDir, ".asdl", "extensions", fileName), source);
}

function writeProjectManifest(workspace: Workspace, packageName: string, manifest: unknown): void {
	writeFile(join(workspace.cwd, ".asdl", "extensions", packageName, "package.json"), JSON.stringify(manifest));
}

function writeFile(path: string, source: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source);
}

function commandEntry(name: string, message: string): string {
	return `
import { defineCommand, ok } from "@asdl/sdl/sdk";

export default defineCommand({
	name: ${JSON.stringify(name)},
	description: ${JSON.stringify(`${name} command`)},
	run() { return ok(${JSON.stringify(message)}); },
});
`;
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("extension registry", () => {
	test("catalog includes all built-ins from the unified built-in command table", async () => {
		const workspace = await createWorkspace();

		const loaded = await loadSdlCommandCatalog({ cwd: workspace.cwd, env: {}, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect([...loaded.candidates.keys()]).toEqual(["changes", "cp", "submit"]);
		expect(loaded.commandInfos.map((info) => [info.name, info.description])).toEqual([
			["changes", "Summarize outstanding worktree changes without committing."],
			["cp", "Create a checkpoint commit for the current diff."],
			["submit", "Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai --no-interactive."],
		]);
	});

	test("project overrides global and global overrides built-in without importing candidates", async () => {
		const workspace = await createWorkspace();
		writeGlobalExtension(workspace, "cp.ts", commandEntry("cp", "global cp"));
		writeGlobalExtension(workspace, "greet.ts", commandEntry("greet", "global greet"));
		writeProjectExtension(workspace, "greet.ts", commandEntry("greet", "project greet"));

		const loaded = await loadSdlCommandCatalog({ cwd: workspace.cwd, env: {}, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect(loaded.diagnostics.filter((diagnostic) => diagnostic.code === "extension_command_override")).toHaveLength(2);
		expect(loaded.commandInfos.find((info) => info.name === "cp")?.description).toBe("Run SDL extension command 'cp'.");
		expect(loaded.commandInfos.find((info) => info.name === "greet")?.description).toBe("Run SDL extension command 'greet'.");

		const selected = loaded.candidates.get("greet");
		expect(selected).toBeDefined();
		if (selected === undefined) return;
		const command = await loadSelectedSdlCommand(selected);
		expect(command.ok).toBe(true);
		if (!command.ok) return;
		const result = await command.command.run({
			cwd: workspace.cwd,
			env: {},
			async exec() {
				return { code: 0, stdout: "", stderr: "", killed: false };
			},
			model: { async generateText() { return { ok: true, text: "" }; } },
		}, {});
		expect(result).toEqual({ ok: true, message: "project greet" });
	});

	test("manifest metadata customizes catalog help without importing command entries", async () => {
		const workspace = await createWorkspace();
		writeProjectManifest(workspace, "pkg", { asdl: { commands: [{ name: "hello", description: "Say hello.", fullDescription: "Say hello with details.", entry: "./src/hello.ts" }] } });
		writeFile(join(workspace.cwd, ".asdl", "extensions", "pkg", "src", "hello.ts"), "throw new Error('should not import during discovery');\n");

		const loaded = await loadSdlCommandCatalog({ cwd: workspace.cwd, env: {}, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect(loaded.commandInfos.find((info) => info.name === "hello")).toEqual({
			name: "hello",
			description: "Say hello.",
			fullDescription: "Say hello with details.",
		});
	});

	test("duplicate command names within one source level are errors", async () => {
		const workspace = await createWorkspace();
		writeProjectExtension(workspace, "one.ts", commandEntry("one", "one"));
		writeProjectManifest(workspace, "pkg", { asdl: { commands: [{ name: "one", description: "One.", entry: "./src/one.ts" }] } });
		writeFile(join(workspace.cwd, ".asdl", "extensions", "pkg", "src", "one.ts"), commandEntry("one", "pkg"));

		const loaded = await loadSdlCommandCatalog({ cwd: workspace.cwd, env: {}, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(true);
		expect(loaded.diagnostics).toContainEqual(expect.objectContaining({ code: "extension_command_duplicate_in_level" }));
	});

	test("invalid inferred command names and selected import failures are structured errors", async () => {
		const workspace = await createWorkspace();
		writeProjectExtension(workspace, "Bad.ts", commandEntry("Bad", "bad"));
		writeProjectExtension(workspace, "throws.ts", "throw new Error('boom');\n");

		const loaded = await loadSdlCommandCatalog({ cwd: workspace.cwd, env: {}, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(true);
		expect(loaded.diagnostics).toContainEqual(expect.objectContaining({ code: "extension_command_name_invalid" }));
		const selected = loaded.candidates.get("throws");
		expect(selected).toBeDefined();
		if (selected === undefined) return;
		const command = await loadSelectedSdlCommand(selected);
		expect(command).toMatchObject({ ok: false, diagnostic: { code: "extension_command_import_failed" } });
	});
});
