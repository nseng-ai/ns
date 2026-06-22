import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { commandInfoForLoadedCommand } from "../../src/command-registry.ts";
import {
	classifyExtensionDiagnosticsForInvocation,
	hasExtensionErrors,
	loadListingCommandInfos,
	loadSdlCommandCatalog,
	loadSelectedSdlCommand,
} from "../../src/extension-registry.ts";

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
	writeFile(join(workspace.cwd, ".sdl", "extensions", fileName), source);
}

function writeGlobalExtension(workspace: Workspace, fileName: string, source: string): void {
	writeFile(join(workspace.homeDir, ".local", "share", "sdl", "extensions", fileName), source);
}

function writeLegacyGlobalExtension(workspace: Workspace, fileName: string, source: string): void {
	writeFile(join(workspace.homeDir, ".sdl", "extensions", fileName), source);
}

function writeProjectManifest(workspace: Workspace, packageName: string, manifest: unknown): void {
	writeFile(
		join(workspace.cwd, ".sdl", "extensions", packageName, "package.json"),
		JSON.stringify(manifest),
	);
}

function writeFile(path: string, source: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source);
}

function commandEntry(name: string, message: string): string {
	return `
import { defineExtension, ok } from "@sdl/sdl/sdk";

export default defineExtension({
	commands: [{
	name: ${JSON.stringify(name)},
	summary: ${JSON.stringify(`${name} summary`)},
	description: ${JSON.stringify(`${name} command`)},
	run() { return ok(${JSON.stringify(message)}); },
}],
});
`;
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("extension registry", () => {
	test("catalog can be empty without built-ins or external extensions", async () => {
		const workspace = await createWorkspace();

		const loaded = await loadSdlCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect([...loaded.candidates.keys()]).toEqual([]);
		expect(loaded.commandInfos).toEqual([]);
	});

	test("XDG global commands are loaded and legacy global commands are ignored", async () => {
		const workspace = await createWorkspace();
		writeLegacyGlobalExtension(workspace, "legacy.ts", commandEntry("legacy", "legacy greet"));
		writeGlobalExtension(workspace, "greet.ts", commandEntry("greet", "xdg greet"));

		const loaded = await loadSdlCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect(
			loaded.diagnostics.filter((diagnostic) => diagnostic.code === "extension_command_override"),
		).toHaveLength(0);
		expect(loaded.candidates.has("legacy")).toBe(false);
		const selected = loaded.candidates.get("greet");
		expect(selected).toBeDefined();
		if (selected === undefined) return;
		const command = await loadSelectedSdlCommand(selected);
		expect(command.ok).toBe(true);
		if (!command.ok) return;
		const result = await command.command.run(
			{
				cwd: workspace.cwd,
				env: {},
				async exec() {
					return { code: 0, stdout: "", stderr: "", killed: false };
				},
				textGenerator: {
					async generateText() {
						return { ok: true, text: "" };
					},
				},
			},
			{},
		);
		expect(result).toEqual({ ok: true, message: "xdg greet" });
	});

	test("project overrides global without importing candidates", async () => {
		const workspace = await createWorkspace();
		writeGlobalExtension(workspace, "cp.ts", commandEntry("cp", "global cp"));
		writeGlobalExtension(workspace, "greet.ts", commandEntry("greet", "global greet"));
		writeProjectExtension(workspace, "greet.ts", commandEntry("greet", "project greet"));

		const loaded = await loadSdlCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect(
			loaded.diagnostics.filter((diagnostic) => diagnostic.code === "extension_command_override"),
		).toHaveLength(1);
		expect(loaded.commandInfos.find((info) => info.name === "cp")?.description).toBe(
			"Run SDL command entry 'cp'.",
		);
		expect(loaded.commandInfos.find((info) => info.name === "greet")?.description).toBe(
			"Run SDL command entry 'greet'.",
		);

		const selected = loaded.candidates.get("greet");
		expect(selected).toBeDefined();
		if (selected === undefined) return;
		const command = await loadSelectedSdlCommand(selected);
		expect(command.ok).toBe(true);
		if (!command.ok) return;
		const result = await command.command.run(
			{
				cwd: workspace.cwd,
				env: {},
				async exec() {
					return { code: 0, stdout: "", stderr: "", killed: false };
				},
				textGenerator: {
					async generateText() {
						return { ok: true, text: "" };
					},
				},
			},
			{},
		);
		expect(result).toEqual({ ok: true, message: "project greet" });
	});

	test("manifest metadata customizes catalog help without importing command entries", async () => {
		const workspace = await createWorkspace();
		writeProjectManifest(workspace, "pkg", {
			sdl: {
				commands: [
					{
						name: "hello",
						description: "Say hello.",
						fullDescription: "Say hello with details.",
						entry: "./src/hello.ts",
					},
				],
			},
		});
		writeFile(
			join(workspace.cwd, ".sdl", "extensions", "pkg", "src", "hello.ts"),
			"throw new Error('should not import during discovery');\n",
		);

		const loaded = await loadSdlCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect(loaded.commandInfos.find((info) => info.name === "hello")).toEqual({
			name: "hello",
			description: "Say hello.",
			fullDescription: "Say hello with details.",
		});
	});

	test("listing command infos eager-load direct command summaries", async () => {
		const workspace = await createWorkspace();
		writeProjectExtension(
			workspace,
			"hello.ts",
			commandEntry("hello", "hello from loaded command"),
		);

		const catalog = await loadSdlCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});
		const loaded = await loadListingCommandInfos(catalog);

		expect(loaded.diagnostics).toEqual([]);
		expect(loaded.commandInfos).toEqual([
			{
				name: "hello",
				description: "hello summary",
				fullDescription: "hello command",
			},
		]);
	});

	test("listing command infos preserve package manifest metadata without importing", async () => {
		const workspace = await createWorkspace();
		writeProjectManifest(workspace, "pkg", {
			sdl: {
				commands: [
					{
						name: "hello",
						description: "Say hello.",
						fullDescription: "Say hello with details.",
						entry: "./src/hello.ts",
					},
				],
			},
		});
		writeFile(
			join(workspace.cwd, ".sdl", "extensions", "pkg", "src", "hello.ts"),
			"throw new Error('should not import package commands for listing');\n",
		);

		const catalog = await loadSdlCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});
		const loaded = await loadListingCommandInfos(catalog);

		expect(loaded.diagnostics).toEqual([]);
		expect(loaded.commandInfos).toEqual([
			{
				name: "hello",
				description: "Say hello.",
				fullDescription: "Say hello with details.",
			},
		]);
	});

	test("listing command infos keep placeholders and diagnose failed imports", async () => {
		const workspace = await createWorkspace();
		writeProjectExtension(workspace, "hello.ts", "throw new Error('listing boom');\n");

		const catalog = await loadSdlCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});
		const loaded = await loadListingCommandInfos(catalog);

		expect(loaded.commandInfos).toEqual([
			{
				name: "hello",
				description: "Run SDL command entry 'hello'.",
				fullDescription: "Run SDL command entry 'hello'.",
			},
		]);
		expect(loaded.diagnostics).toEqual([
			expect.objectContaining({
				code: "sdl_extension_contribution_import_failed",
				commandName: "hello",
			}),
		]);
	});

	test("loaded command info uses explicit summary and full description", () => {
		const info = commandInfoForLoadedCommand(
			{
				name: "hello",
				summary: "Say hello.",
				description: "Say hello.\n\nWith details.",
				run: () => ({ ok: true, message: "hello" }),
			},
			"project",
		);

		expect(info).toEqual({
			name: "hello",
			description: "Say hello.",
			fullDescription: "Say hello.\n\nWith details.",
		});
	});

	test("one SDL extension module can contribute multiple manifest-listed commands", async () => {
		const workspace = await createWorkspace();
		writeProjectManifest(workspace, "pkg", {
			sdl: {
				commands: [
					{ name: "hello", description: "Say hello.", entry: "./src/commands.ts" },
					{ name: "bye", description: "Say bye.", entry: "./src/commands.ts" },
				],
			},
		});
		writeFile(
			join(workspace.cwd, ".sdl", "extensions", "pkg", "src", "commands.ts"),
			`
import { defineExtension, ok } from "@sdl/sdl/sdk";

export default defineExtension({
	commands: [
		{ name: "hello", summary: "Say hello.", description: "Say hello with details.", run() { return ok("hello"); } },
		{ name: "bye", summary: "Say bye.", description: "Say bye with details.", run() { return ok("bye"); } },
	],
});
`,
		);

		const loaded = await loadSdlCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect([...loaded.candidates.keys()]).toEqual(["bye", "hello"]);
		const selected = loaded.candidates.get("bye");
		expect(selected).toBeDefined();
		if (selected === undefined) return;
		const command = await loadSelectedSdlCommand(selected);
		expect(command.ok).toBe(true);
		if (!command.ok) return;
		const result = await command.command.run(
			{
				cwd: workspace.cwd,
				env: {},
				async exec() {
					return { code: 0, stdout: "", stderr: "", killed: false };
				},
				textGenerator: {
					async generateText() {
						return { ok: true, text: "" };
					},
				},
			},
			{},
		);
		expect(result).toEqual({ ok: true, message: "bye" });
	});

	test("duplicate command names within one source level are errors", async () => {
		const workspace = await createWorkspace();
		writeProjectExtension(workspace, "one.ts", commandEntry("one", "one"));
		writeProjectManifest(workspace, "pkg", {
			sdl: { commands: [{ name: "one", description: "One.", entry: "./src/one.ts" }] },
		});
		writeFile(
			join(workspace.cwd, ".sdl", "extensions", "pkg", "src", "one.ts"),
			commandEntry("one", "pkg"),
		);

		const loaded = await loadSdlCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(true);
		expect(loaded.diagnostics).toContainEqual(
			expect.objectContaining({ code: "extension_command_duplicate_in_level" }),
		);
	});

	test("invalid inferred command names and selected import failures are structured errors", async () => {
		const workspace = await createWorkspace();
		writeProjectExtension(workspace, "Bad.ts", commandEntry("Bad", "bad"));
		writeProjectExtension(workspace, "throws.ts", "throw new Error('boom');\n");

		const loaded = await loadSdlCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(true);
		expect(loaded.diagnostics).toContainEqual(
			expect.objectContaining({ code: "extension_command_name_invalid", commandName: "Bad" }),
		);
		const selected = loaded.candidates.get("throws");
		expect(selected).toBeDefined();
		if (selected === undefined) return;
		const command = await loadSelectedSdlCommand(selected);
		expect(command).toMatchObject({
			ok: false,
			diagnostic: { code: "sdl_extension_contribution_import_failed", commandName: "throws" },
		});
	});

	test("diagnostic classification treats unrelated selected-command diagnostics as warnings", () => {
		const selectedCandidate = {
			name: "cp",
			description: "cp",
			fullDescription: "cp",
			source: { level: "built-in" as const, label: "built-in command cp" },
			command: {
				name: "cp",
				summary: "cp",
				description: "cp",
				run: () => ({ ok: true as const, message: "" }),
			},
		};

		const classified = classifyExtensionDiagnosticsForInvocation({
			diagnostics: [
				{
					severity: "error",
					code: "broken",
					message: "broken hello",
					commandName: "hello",
					sourceLevel: "project",
				},
			],
			requestedCommandName: "cp",
			selectedCandidate,
		});

		expect(classified).toEqual({
			fatal: [],
			warnings: [expect.objectContaining({ commandName: "hello" })],
		});
	});

	test("diagnostic classification makes selected same-level duplicates fatal", () => {
		const classified = classifyExtensionDiagnosticsForInvocation({
			diagnostics: [
				{
					severity: "error",
					code: "extension_command_duplicate_in_level",
					message: "Duplicate cp",
					commandName: "cp",
					sourceLevel: "project",
				},
			],
			requestedCommandName: "cp",
			selectedCandidate: {
				name: "cp",
				description: "cp",
				fullDescription: "cp",
				entryPath: "/project/cp.ts",
				kind: "file",
				source: { level: "project", label: "project cp", path: "/project/cp.ts" },
			},
		});

		expect(classified.fatal).toHaveLength(1);
		expect(classified.warnings).toHaveLength(0);
	});

	test("diagnostic classification allows higher-precedence valid selected candidates", () => {
		const classified = classifyExtensionDiagnosticsForInvocation({
			diagnostics: [
				{
					severity: "error",
					code: "broken",
					message: "broken global cp",
					commandName: "cp",
					sourceLevel: "global",
				},
			],
			requestedCommandName: "cp",
			selectedCandidate: {
				name: "cp",
				description: "cp",
				fullDescription: "cp",
				entryPath: "/project/cp.ts",
				kind: "file",
				source: { level: "project", label: "project cp", path: "/project/cp.ts" },
			},
		});

		expect(classified).toEqual({
			fatal: [],
			warnings: [expect.objectContaining({ sourceLevel: "global" })],
		});
	});

	test("diagnostic classification blocks fallback below a higher-precedence selected-name error", () => {
		const classified = classifyExtensionDiagnosticsForInvocation({
			diagnostics: [
				{
					severity: "error",
					code: "broken",
					message: "broken project cp",
					commandName: "cp",
					sourceLevel: "project",
				},
			],
			requestedCommandName: "cp",
			selectedCandidate: {
				name: "cp",
				description: "cp",
				fullDescription: "cp",
				source: { level: "built-in", label: "built-in command cp" },
				command: {
					name: "cp",
					summary: "cp",
					description: "cp",
					run: () => ({ ok: true as const, message: "" }),
				},
			},
		});

		expect(classified.fatal).toHaveLength(1);
		expect(classified.warnings).toHaveLength(0);
	});
});
