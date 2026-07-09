import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { defineRawCommand, noopNsCommandIo, noopNsProgress, ok } from "@nseng-ai/kernel/sdk";
import { commandInfoForLoadedCommand } from "../../src/extensions/command-registry.ts";
import {
	classifyExtensionDiagnosticsForInvocation,
	hasExtensionErrors,
	loadListingCommandInfos,
	loadNsCommandCatalog,
	loadSelectedNsCommand,
} from "../../src/extensions/registry.ts";

import {
	createExtensionRegistryWorkspace,
	writeWorkspaceFile,
} from "../helpers/extension-workspace.ts";

const builtInCandidateKeys = ["extension/point", "extension/points", "install"];
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
	{
		name: "install",
		description: "Install a local ns extension package.",
		fullDescription:
			"Install a local ns extension package into managed storage and record the source spec in ns.toml.",
		helpGroup: "Built-ins:",
	},
] as const;

function descriptorCommandModule(name: string, message: string): string {
	return `
import { defineRawCommand, ok } from "@nseng-ai/kernel/sdk";

export default defineRawCommand({
	name: ${JSON.stringify(name)},
	summary: ${JSON.stringify(`${name} summary`)},
	description: ${JSON.stringify(`${name} command`)},
	run() { return ok({ message: ${JSON.stringify(message)} }); },
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

	test("ns.toml-declared descriptor package contributes nested command candidates", async () => {
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
import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	group: "tools",
	description: "Tool commands.",
	entries: [
		{ name: "scan", load: () => import("../commands/scan.ts") },
		{
			group: "exec",
			hidden: true,
			description: "Agent-only tool commands.",
			entries: [{ name: "doctor", load: () => import("../commands/doctor.ts") }],
		},
	],
});
`,
		);
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "tools", "src", "commands", "scan.ts"),
			descriptorCommandModule("scan", "scanned"),
		);
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "tools", "src", "commands", "doctor.ts"),
			descriptorCommandModule("doctor", "healthy"),
		);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect(loaded.candidates.get("tools/scan")).toMatchObject({
			name: "scan",
			group: "tools",
			groupDescription: "Tool commands.",
			moduleReference: { type: "loaded" },
			source: { level: "project" },
		});
		expect(loaded.candidates.get("tools/exec/doctor")).toMatchObject({
			name: "doctor",
			segments: ["tools", "exec", "doctor"],
			hiddenSegments: ["tools/exec"],
		});
		const listing = await loadListingCommandInfos(loaded);
		expect(listing.diagnostics).toEqual([]);
		expect(listing.commandInfos).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "scan",
					group: "tools",
					description: "scan summary",
					fullDescription: "scan command",
				}),
				expect.objectContaining({
					segments: ["tools", "exec", "doctor"],
					description: "doctor summary",
					hiddenSegments: ["tools/exec"],
				}),
			]),
		);
	});

	test("listing loads non-static loaded entries serially", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		let activeLoads = 0;

		function loadedEntry(name: string) {
			return {
				group: "tools",
				groupDescription: "Tool commands.",
				name,
				description: `${name} placeholder.`,
				fullDescription: `${name} placeholder.`,
				displayPath: `fixture#${name}`,
				hasStaticCommandInfo: false,
				async load() {
					activeLoads += 1;
					if (activeLoads > 1) throw new Error("listing loads overlapped");
					await Promise.resolve();
					activeLoads -= 1;
					return defineRawCommand({
						name,
						summary: `${name} summary`,
						description: `${name} command`,
						run: () => ok({ name }),
					});
				},
			};
		}

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			preinstalledCommandCatalog: () => [loadedEntry("one"), loadedEntry("two")],
		});

		const listing = await loadListingCommandInfos(loaded);

		expect(listing.diagnostics).toEqual([]);
		expect(listing.commandInfos).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "one", description: "one summary" }),
				expect.objectContaining({ name: "two", description: "two summary" }),
			]),
		);
	});

	test("descriptor selected load reports command-name mismatches", async () => {
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
import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	group: "tools",
	description: "Tool commands.",
	entries: [{ name: "scan", load: () => import("../commands/scan.ts") }],
});
`,
		);
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "tools", "src", "commands", "scan.ts"),
			descriptorCommandModule("other", "oops"),
		);
		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});
		const selected = loaded.candidates.get("tools/scan");
		expect(selected).toBeDefined();
		if (selected === undefined) return;

		const command = await loadSelectedNsCommand(selected);

		expect(command.ok).toBe(false);
		if (command.ok) return;
		expect(command.diagnostic.code).toBe("extension_command_invalid");
		expect(command.diagnostic.message).toContain(
			'Loaded command name mismatch: descriptor entry "scan" loaded command "other"',
		);
	});

	test("malformed descriptor does not block other declared descriptor packages", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeWorkspaceFile(
			join(workspace.cwd, "ns.toml"),
			'extensions = ["./extensions/bad", "./extensions/good"]\n',
		);
		for (const packageName of ["bad", "good"] as const) {
			writeWorkspaceFile(
				join(workspace.cwd, "extensions", packageName, "package.json"),
				JSON.stringify({
					name: packageName,
					version: "1.0.0",
					exports: { "./ns-extension": "./src/ns/extension.ts" },
				}),
			);
		}
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "bad", "src", "ns", "extension.ts"),
			"export default { entries: [] };\n",
		);
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "good", "src", "ns", "extension.ts"),
			`
import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	group: "good",
	description: "Good commands.",
	entries: [{ name: "scan", load: () => import("../commands/scan.ts") }],
});
`,
		);
		writeWorkspaceFile(
			join(workspace.cwd, "extensions", "good", "src", "commands", "scan.ts"),
			descriptorCommandModule("scan", "ok"),
		);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});

		expect(loaded.candidates.has("good/scan")).toBe(true);
		expect(loaded.diagnostics).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "extension_descriptor_invalid" })]),
		);
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
						defineRawCommand({
							name: "scan",
							summary: "Scan from a thunk.",
							description: "Scan from a thunk.",
							run: () => ok("thunk scan"),
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
			{ argv: [] },
		);
		expect(result).toEqual({ type: "ok", data: "thunk scan", human: "thunk scan" });
	});

	test("loaded command info uses explicit summary and full description", () => {
		const info = commandInfoForLoadedCommand(
			{
				name: "hello",
				summary: "Say hello.",
				description: "Say hello.\n\nWith details.",
				run: () => ok("hello"),
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
				run: () => ok(""),
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
					message: "broken preinstalled cp",
					commandName: "cp",
					sourceLevel: "preinstalled",
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
			warnings: [expect.objectContaining({ sourceLevel: "preinstalled" })],
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
					run: () => ok(""),
				},
			},
		});

		expect(classified.fatal).toHaveLength(1);
		expect(classified.warnings).toHaveLength(0);
	});
});
