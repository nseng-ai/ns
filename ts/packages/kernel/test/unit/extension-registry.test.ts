import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { defineExtension, noopNsCommandIo, noopNsProgress, ok } from "@nseng-ai/kernel/sdk";
import { commandInfoForLoadedCommand, commandKey } from "../../src/extensions/command-registry.ts";
import {
	classifyExtensionDiagnosticsForInvocation,
	hasExtensionErrors,
	loadListingCommandInfos,
	loadNsCommandCatalog,
	loadSelectedNsCommand,
} from "../../src/extensions/registry.ts";

import {
	createExtensionRegistryWorkspace,
	writeGlobalExtension,
	writeLegacyGlobalExtension,
	writeProjectExtension,
	writeProjectManifest,
	writeWorkspaceFile,
} from "../helpers/extension-workspace.ts";

const builtInCandidateKeys = ["extension/point", "extension/points"];
const builtInCommandInfos = [
	{
		segments: ["extension", "point"],
		groupDescription: "Inspect ns extension metadata.",
		name: "point",
		description: "Show one ns point definition and its active source.",
		fullDescription: "Show one ns point definition and its active source.",
	},
	{
		segments: ["extension", "points"],
		groupDescription: "Inspect ns extension metadata.",
		name: "points",
		description: "List defined ns points and their active sources.",
		fullDescription: "List defined ns points and their active sources.",
	},
] as const;

function commandEntry(name: string, message: string): string {
	return `
import { defineExtension, ok } from "@nseng-ai/kernel/sdk";

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

function preinstalledEntry(group: string, name: string, moduleSpecifier: string) {
	return {
		group,
		groupDescription: `${group} commands.`,
		name,
		description: `${name} command.`,
		fullDescription: `${name} command.`,
		moduleSpecifier,
	};
}

describe("extension registry", () => {
	test("catalog contains only built-ins without external extensions", async () => {
		const workspace = await createExtensionRegistryWorkspace();

		const loaded = await loadNsCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect([...loaded.candidates.keys()]).toEqual(builtInCandidateKeys);
		expect(loaded.commandInfos).toEqual(builtInCommandInfos);
	});

	test("injected preinstalled catalog contributes package commands", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			preinstalledCommandCatalog: () => [
				preinstalledEntry("tools", "scan", "@example/tools/ns/commands/scan"),
				preinstalledEntry("tools", "doctor", "@example/tools/ns/commands/doctor"),
			],
		});

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect(loaded.candidates.get("tools/scan")).toMatchObject({
			name: "scan",
			group: "tools",
			moduleReference: { type: "package", specifier: "@example/tools/ns/commands/scan" },
			source: { level: "preinstalled" },
		});
		expect(loaded.candidates.get("tools/doctor")).toMatchObject({
			name: "doctor",
			group: "tools",
			source: { level: "preinstalled" },
		});
	});

	test("thunk-backed preinstalled entries load without package resolution", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			preinstalledCommandCatalog: () => [
				{
					group: "tools",
					groupDescription: "tools commands.",
					name: "scan",
					description: "scan command.",
					fullDescription: "scan command.",
					displayPath: "@example/tools/ns/commands/scan",
					load: () =>
						defineExtension({
							commands: [
								{
									name: "scan",
									summary: "Scan from a thunk.",
									description: "Scan from a thunk.",
									run: () => ok("thunk scan"),
								},
							],
						}),
				},
			],
		});

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		const selected = loaded.candidates.get("tools/scan");
		expect(selected).toMatchObject({
			moduleReference: { type: "loaded", displayPath: "@example/tools/ns/commands/scan" },
		});
		if (selected === undefined) return;

		const command = await loadSelectedNsCommand(selected);
		expect(command.ok).toBe(true);
		if (!command.ok) return;
		const result = await command.command.run(
			{
				cwd: workspace.cwd,
				env: {},
				commandIo: noopNsCommandIo,
				progress: noopNsProgress,
				renderCapabilities: { canEmitAnsi: false },
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
		expect(result).toEqual({ ok: true, message: "thunk scan" });
	});

	test("source-dev preinstalled discovery yields to injected catalog duplicates", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const sourceCatalog = await loadNsCommandCatalog({
			cwd: process.cwd(),
			homeDir: workspace.homeDir,
		});
		const sourceCandidate = [...sourceCatalog.candidates.values()].find(
			(candidate) =>
				candidate.source.level === "preinstalled" &&
				candidate.source.label.startsWith("source-dev package "),
		);
		expect(sourceCandidate).toBeDefined();
		if (sourceCandidate === undefined) return;
		const key = commandKey(sourceCandidate);

		const loaded = await loadNsCommandCatalog({
			cwd: process.cwd(),
			homeDir: workspace.homeDir,
			preinstalledCommandCatalog: () => [
				{
					...(sourceCandidate.group === undefined ? {} : { group: sourceCandidate.group }),
					...(sourceCandidate.groupDescription === undefined
						? {}
						: { groupDescription: sourceCandidate.groupDescription }),
					...(sourceCandidate.segments === undefined ? {} : { path: sourceCandidate.segments }),
					name: sourceCandidate.name,
					description: "Injected duplicate.",
					fullDescription: "Injected duplicate.",
					moduleSpecifier: "@example/source-dev-duplicate",
				},
			],
		});

		expect(loaded.candidates.get(key)).toMatchObject({
			moduleReference: { type: "package", specifier: "@example/source-dev-duplicate" },
			source: { level: "preinstalled", path: "@example/source-dev-duplicate" },
		});
		expect(loaded.diagnostics).not.toContainEqual(
			expect.objectContaining({
				code: "extension_command_duplicate_in_level",
				commandName: key,
			}),
		);
	});

	test("XDG global commands are loaded and legacy global commands are ignored", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeLegacyGlobalExtension(workspace, "legacy.ts", commandEntry("legacy", "legacy greet"));
		writeGlobalExtension(workspace, "greet.ts", commandEntry("greet", "xdg greet"));

		const loaded = await loadNsCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect(
			loaded.diagnostics.filter((diagnostic) => diagnostic.code === "extension_command_override"),
		).toHaveLength(0);
		expect(loaded.candidates.has("legacy")).toBe(false);
		const selected = loaded.candidates.get("greet");
		expect(selected).toBeDefined();
		if (selected === undefined) return;
		const command = await loadSelectedNsCommand(selected);
		expect(command.ok).toBe(true);
		if (!command.ok) return;
		const result = await command.command.run(
			{
				cwd: workspace.cwd,
				env: {},
				commandIo: noopNsCommandIo,
				progress: noopNsProgress,
				renderCapabilities: { canEmitAnsi: false },
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
		const workspace = await createExtensionRegistryWorkspace();
		writeGlobalExtension(workspace, "cp.ts", commandEntry("cp", "global cp"));
		writeGlobalExtension(workspace, "greet.ts", commandEntry("greet", "global greet"));
		writeProjectExtension(workspace, "greet.ts", commandEntry("greet", "project greet"));

		const loaded = await loadNsCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect(
			loaded.diagnostics.filter((diagnostic) => diagnostic.code === "extension_command_override"),
		).toHaveLength(1);
		expect(loaded.commandInfos.find((info) => info.name === "cp")?.description).toBe(
			"Run ns command entry 'cp'.",
		);
		expect(loaded.commandInfos.find((info) => info.name === "greet")?.description).toBe(
			"Run ns command entry 'greet'.",
		);

		const selected = loaded.candidates.get("greet");
		expect(selected).toBeDefined();
		if (selected === undefined) return;
		const command = await loadSelectedNsCommand(selected);
		expect(command.ok).toBe(true);
		if (!command.ok) return;
		const result = await command.command.run(
			{
				cwd: workspace.cwd,
				env: {},
				commandIo: noopNsCommandIo,
				progress: noopNsProgress,
				renderCapabilities: { canEmitAnsi: false },
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

	test("project manifest overrides injected preinstalled catalog", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeProjectManifest(workspace, "tools", {
			ns: {
				group: "tools",
				description: "Project tools override.",
				commands: [
					{
						name: "scan",
						description: "Project scan.",
						entry: "./src/scan.ts",
					},
				],
			},
		});
		writeWorkspaceFile(
			join(workspace.cwd, ".ns", "extensions", "tools", "src", "scan.ts"),
			commandEntry("scan", "project scan"),
		);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			preinstalledCommandCatalog: () => [
				preinstalledEntry("tools", "scan", "@example/tools/ns/commands/scan"),
			],
		});

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect(loaded.candidates.get("tools/scan")).toMatchObject({
			description: "Project scan.",
			source: { level: "project" },
		});
		expect(
			loaded.diagnostics.filter((diagnostic) => diagnostic.code === "extension_command_override"),
		).toHaveLength(1);
	});

	test("manifest metadata customizes catalog help without importing command entries", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeProjectManifest(workspace, "pkg", {
			ns: {
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
		writeWorkspaceFile(
			join(workspace.cwd, ".ns", "extensions", "pkg", "src", "hello.ts"),
			"throw new Error('should not import during discovery');\n",
		);

		const loaded = await loadNsCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect(loaded.commandInfos.find((info) => info.name === "hello")).toEqual({
			name: "hello",
			description: "Say hello.",
			fullDescription: "Say hello with details.",
		});
	});

	test("listing command infos eager-load direct command summaries", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeProjectExtension(
			workspace,
			"hello.ts",
			commandEntry("hello", "hello from loaded command"),
		);

		const catalog = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});
		const loaded = await loadListingCommandInfos(catalog);

		expect(loaded.diagnostics).toEqual([]);
		expect(loaded.commandInfos).toEqual([
			...builtInCommandInfos,
			{
				name: "hello",
				description: "hello summary",
				fullDescription: "hello command",
			},
		]);
	});

	test("simple default re-export shims become package module references during discovery", async () => {
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
	});

	test("listing command infos preserve package manifest metadata without importing", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeProjectManifest(workspace, "pkg", {
			ns: {
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
		writeWorkspaceFile(
			join(workspace.cwd, ".ns", "extensions", "pkg", "src", "hello.ts"),
			"throw new Error('should not import package commands for listing');\n",
		);

		const catalog = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});
		const loaded = await loadListingCommandInfos(catalog);

		expect(loaded.diagnostics).toEqual([]);
		expect(loaded.commandInfos).toEqual([
			...builtInCommandInfos,
			{
				name: "hello",
				description: "Say hello.",
				fullDescription: "Say hello with details.",
			},
		]);
	});

	test("catalog carries manifest group metadata", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeProjectManifest(workspace, "handoff", {
			ns: {
				description: "Coordinate handoff artifacts.",
				group: "handoff",
				commands: [
					{
						name: "list",
						description: "List stored handoffs.",
						fullDescription: "List stored handoffs with descriptions.",
						entry: "./src/list.ts",
					},
				],
			},
		});
		writeWorkspaceFile(
			join(workspace.cwd, ".ns", "extensions", "handoff", "src", "list.ts"),
			commandEntry("list", "list"),
		);

		const catalog = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});

		expect([...catalog.candidates.keys()]).toEqual([...builtInCandidateKeys, "handoff/list"]);
		expect(catalog.commandInfos).toEqual([
			...builtInCommandInfos,
			{
				group: "handoff",
				groupDescription: "Coordinate handoff artifacts.",
				name: "list",
				description: "List stored handoffs.",
				fullDescription: "List stored handoffs with descriptions.",
			},
		]);
	});

	test("listing command infos preserve manifest group metadata without importing modules", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeProjectManifest(workspace, "handoff", {
			ns: {
				group: "handoff",
				commands: [{ name: "create", description: "Create handoffs.", entry: "./src/create.ts" }],
			},
		});
		writeWorkspaceFile(
			join(workspace.cwd, ".ns", "extensions", "handoff", "src", "create.ts"),
			"throw new Error('group manifest entries should not load for listing');\n",
		);

		const catalog = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});
		const loaded = await loadListingCommandInfos(catalog);

		expect(loaded.diagnostics).toEqual([]);
		expect(loaded.commandInfos).toEqual([
			...builtInCommandInfos,
			{
				group: "handoff",
				name: "create",
				description: "Create handoffs.",
				fullDescription: "Create handoffs.",
			},
		]);
	});

	test("listing command infos keep placeholders and diagnose failed imports", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeProjectExtension(workspace, "hello.ts", "throw new Error('listing boom');\n");

		const catalog = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});
		const loaded = await loadListingCommandInfos(catalog);

		expect(loaded.commandInfos).toEqual([
			...builtInCommandInfos,
			{
				name: "hello",
				description: "Run ns command entry 'hello'.",
				fullDescription: "Run ns command entry 'hello'.",
			},
		]);
		expect(loaded.diagnostics).toEqual([
			expect.objectContaining({
				code: "ns_extension_contribution_import_failed",
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
			{ name: "hello" },
		);

		expect(info).toEqual({
			name: "hello",
			description: "Say hello.",
			fullDescription: "Say hello.\n\nWith details.",
		});
	});

	test("one ns extension module can contribute multiple manifest-listed commands", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeProjectManifest(workspace, "pkg", {
			ns: {
				commands: [
					{ name: "hello", description: "Say hello.", entry: "./src/commands.ts" },
					{ name: "bye", description: "Say bye.", entry: "./src/commands.ts" },
				],
			},
		});
		writeWorkspaceFile(
			join(workspace.cwd, ".ns", "extensions", "pkg", "src", "commands.ts"),
			`
import { defineExtension, ok } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	commands: [
		{ name: "hello", summary: "Say hello.", description: "Say hello with details.", run() { return ok("hello"); } },
		{ name: "bye", summary: "Say bye.", description: "Say bye with details.", run() { return ok("bye"); } },
	],
});
`,
		);

		const loaded = await loadNsCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect([...loaded.candidates.keys()]).toEqual(["bye", ...builtInCandidateKeys, "hello"]);
		const selected = loaded.candidates.get("bye");
		expect(selected).toBeDefined();
		if (selected === undefined) return;
		const command = await loadSelectedNsCommand(selected);
		expect(command.ok).toBe(true);
		if (!command.ok) return;
		const result = await command.command.run(
			{
				cwd: workspace.cwd,
				env: {},
				commandIo: noopNsCommandIo,
				progress: noopNsProgress,
				renderCapabilities: { canEmitAnsi: false },
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
		const workspace = await createExtensionRegistryWorkspace();
		writeProjectExtension(workspace, "one.ts", commandEntry("one", "one"));
		writeProjectManifest(workspace, "pkg", {
			ns: { commands: [{ name: "one", description: "One.", entry: "./src/one.ts" }] },
		});
		writeWorkspaceFile(
			join(workspace.cwd, ".ns", "extensions", "pkg", "src", "one.ts"),
			commandEntry("one", "pkg"),
		);

		const loaded = await loadNsCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(true);
		expect(loaded.diagnostics).toContainEqual(
			expect.objectContaining({ code: "extension_command_duplicate_in_level" }),
		);
	});

	test("group command names that collide with top-level commands are rejected", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeProjectExtension(workspace, "handoff.ts", commandEntry("handoff", "top"));
		writeProjectManifest(workspace, "handoff", {
			ns: {
				group: "handoff",
				commands: [{ name: "list", description: "List", entry: "./src/list.ts" }],
			},
		});
		writeWorkspaceFile(
			join(workspace.cwd, ".ns", "extensions", "handoff", "src", "list.ts"),
			commandEntry("list", "list"),
		);

		const loaded = await loadNsCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(true);
		expect(loaded.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "extension_command_group_collision",
				commandName: "handoff/list",
			}),
		);
		expect(loaded.candidates.has("handoff/list")).toBe(false);
		expect(loaded.candidates.has("handoff")).toBe(true);
	});

	test("invalid inferred command names and selected import failures are structured errors", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeProjectExtension(workspace, "Bad.ts", commandEntry("Bad", "bad"));
		writeProjectExtension(workspace, "throws.ts", "throw new Error('boom');\n");

		const loaded = await loadNsCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(true);
		expect(loaded.diagnostics).toContainEqual(
			expect.objectContaining({ code: "extension_command_name_invalid", commandName: "Bad" }),
		);
		const selected = loaded.candidates.get("throws");
		expect(selected).toBeDefined();
		if (selected === undefined) return;
		const command = await loadSelectedNsCommand(selected);
		expect(command).toMatchObject({
			ok: false,
			diagnostic: { code: "ns_extension_contribution_import_failed", commandName: "throws" },
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
				moduleReference: { type: "file", path: "/project/cp.ts" },
				entryPath: "/project/cp.ts",
				hasStaticCommandInfo: false,
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
				moduleReference: { type: "file", path: "/project/cp.ts" },
				entryPath: "/project/cp.ts",
				hasStaticCommandInfo: false,
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
