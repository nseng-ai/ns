import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { hasExtensionErrors, loadExtensions } from "../../src/extension-registry.ts";

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

function writeFile(path: string, source: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source);
}

function commandExtension(name: string, message: string): string {
	return `
import { defineCommand, ok } from "@asdl/sdl/sdk";

export default function extension(api) {
	api.registerCommand(defineCommand({
		name: ${JSON.stringify(name)},
		description: ${JSON.stringify(`${name} command`)},
		run() { return ok(${JSON.stringify(message)}); },
	}));
}
`;
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("extension registry", () => {
	test("loads built-in changes through the built-in extension path", async () => {
		const workspace = await createWorkspace();

		const loaded = await loadExtensions({ cwd: workspace.cwd, env: {}, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect([...loaded.commands.keys()]).toEqual(["changes", "cp", "submit"]);
		expect(loaded.commands.get("changes")?.description).toBe("Summarize outstanding worktree changes without committing.");
	});

	test("project overrides global and global overrides built-in", async () => {
		const workspace = await createWorkspace();
		writeGlobalExtension(workspace, "cp.ts", commandExtension("cp", "global cp"));
		writeGlobalExtension(workspace, "greet.ts", commandExtension("greet", "global greet"));
		writeProjectExtension(workspace, "greet.ts", commandExtension("greet", "project greet"));

		const loaded = await loadExtensions({ cwd: workspace.cwd, env: {}, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect(loaded.diagnostics.filter((diagnostic) => diagnostic.code === "extension_command_override")).toHaveLength(2);
		expect(loaded.commands.get("cp")?.description).toBe("cp command");
		expect(loaded.commands.get("greet")?.description).toBe("greet command");
		const greetResult = await loaded.commands.get("greet")?.run({
			cwd: workspace.cwd,
			env: {},
			async exec() {
				return { code: 0, stdout: "", stderr: "", killed: false };
			},
			model: { async generateText() { return { ok: true, text: "" }; } },
		}, {});
		expect(greetResult).toEqual({ ok: true, message: "project greet" });
	});

	test("duplicate command names within one source level are errors", async () => {
		const workspace = await createWorkspace();
		writeProjectExtension(workspace, "one.ts", commandExtension("greet", "one"));
		writeProjectExtension(workspace, "two.ts", commandExtension("greet", "two"));

		const loaded = await loadExtensions({ cwd: workspace.cwd, env: {}, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(true);
		expect(loaded.diagnostics).toContainEqual(expect.objectContaining({ code: "extension_command_duplicate_in_level" }));
	});

	test("invalid command names and factory throws are structured errors", async () => {
		const workspace = await createWorkspace();
		writeProjectExtension(workspace, "bad-name.ts", commandExtension("Bad", "bad"));
		writeProjectExtension(workspace, "throws.ts", "export default function extension() { throw new Error('boom'); }\n");

		const loaded = await loadExtensions({ cwd: workspace.cwd, env: {}, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(true);
		expect(loaded.diagnostics).toContainEqual(expect.objectContaining({ code: "extension_command_name_invalid" }));
		expect(loaded.diagnostics).toContainEqual(expect.objectContaining({ code: "extension_factory_failed" }));
	});
});
