import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { defineRawCommand, noopNsCommandIo, noopNsProgress, ok } from "@nseng-ai/sdk";
import {
	commandInfoForLoadedCommand,
	toCommandCliInfo,
} from "../../src/extensions/command-registry.ts";
import {
	NS_BUILT_IN_HELP_GROUP,
	NS_EXTENSION_HELP_GROUP,
} from "../../src/extensions/help-presentation.ts";
import {
	managedNpmPackagePaths,
	userManagedNpmStorage,
} from "../../src/project-config/managed-extension-paths.ts";
import {
	extensionDescriptorToPreinstalledCatalog,
	preinstalledNsCommandCatalogFromRegistrations,
} from "../../src/extensions/descriptor-catalog.ts";
import {
	classifyExtensionDiagnosticsForInvocation,
	hasExtensionErrors,
	loadListingCommandInfos,
	loadNsCommandCatalog,
	loadSelectedNsCommand,
} from "../../src/extensions/registry.ts";

import {
	createExtensionRegistryWorkspace,
	writeUserConfig,
	writeUserDescriptorPackage,
	writeWorkspaceFile,
} from "../helpers/extension-workspace.ts";

const builtInCandidateKeys = ["extension/point", "extension/points"];

// Enabled-gate fixtures for user-scope tests (ADR 0055): the Active harness
// arrives explicitly via NS_HARNESS and the user config must opt in.
const piHarnessEnv = { NS_HARNESS: "pi" } as const;
const piSupportedHarnessesLine = 'supported_harnesses = ["pi"]\n';
const builtInCommandInfos = [
	{
		segments: ["extension", "point"],
		groupDescription: "Inspect ns extension metadata.",
		name: "point",
		description: "Show one ns point definition and its active source.",
		fullDescription: "Show one ns point definition and its active source.",
		helpGroup: NS_BUILT_IN_HELP_GROUP,
	},
	{
		segments: ["extension", "points"],
		groupDescription: "Inspect ns extension metadata.",
		name: "points",
		description: "List defined ns points and their active sources.",
		fullDescription: "List defined ns points and their active sources.",
		helpGroup: NS_BUILT_IN_HELP_GROUP,
	},
] as const;

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

function preinstalledCatalog<T>(
	entries: readonly T[],
	extensionPackageNames: readonly string[] = [],
	builtInPackageNames: readonly string[] = [],
) {
	return { entries, extensionPackageNames, builtInPackageNames };
}

function descriptorSource(options: {
	group: string;
	packageLabel: string;
	commandNames: readonly string[];
}): string {
	return `
import { defineExtension } from "@nseng-ai/sdk";
const command = (name) => ({ name, summary: name + " summary", description: name + " command", run: () => ({ type: "ok", data: { package: ${JSON.stringify(options.packageLabel)} } }) });
export default defineExtension({
  group: ${JSON.stringify(options.group)},
  description: ${JSON.stringify(`${options.packageLabel} commands.`)},
  entries: ${JSON.stringify(options.commandNames)}.map((name) => ({ name, load: () => ({ default: command(name) }) })),
});
`;
}

function writeManagedUserNpmDescriptorPackage(options: {
	extensionsDataRoot: string;
	packageName: string;
	descriptorSource: string;
}): string {
	const packageRoot = managedNpmPackagePaths(
		userManagedNpmStorage(options.extensionsDataRoot),
		options.packageName,
	).packageRoot;
	writeWorkspaceFile(
		join(packageRoot, "package.json"),
		JSON.stringify({
			name: options.packageName,
			version: "1.0.0",
			exports: { "./ns-extension": "./src/ns-extension.ts" },
		}),
	);
	writeWorkspaceFile(join(packageRoot, "src", "ns-extension.ts"), options.descriptorSource);
	return packageRoot;
}

function writeDescriptorPackage(options: {
	cwd: string;
	directoryName: string;
	packageName: string;
	descriptorSource: string;
}): void {
	const packageRoot = join(options.cwd, "extensions", options.directoryName);
	writeWorkspaceFile(
		join(packageRoot, "package.json"),
		JSON.stringify({
			name: options.packageName,
			version: "1.0.0",
			exports: { "./ns-extension": "./src/ns-extension.ts" },
		}),
	);
	writeWorkspaceFile(join(packageRoot, "src", "ns-extension.ts"), options.descriptorSource);
}

describe("extension registry", () => {
	test.each([
		["preinstalled", undefined, undefined],
		["preinstalled", "package", "package"],
		["project", "npm", "package"],
		["project", "local", "local"],
	] as const)(
		"derives %s/%s candidates as %s extension origins",
		(sourceLevel, sourceKind, extensionOrigin) => {
			const info = toCommandCliInfo({
				name: "probe",
				description: "Probe.",
				fullDescription: "Probe.",
				...(sourceKind === undefined ? {} : { sourceKind }),
				source: { level: sourceLevel },
			});

			expect(info.extensionOrigin).toBe(extensionOrigin);
		},
	);

	test("preinstalled descriptor flattening presents commands as extensions", () => {
		const entries = extensionDescriptorToPreinstalledCatalog(
			{
				description: "Optional commands.",
				requiresExtensions: ["@example/provider"],
				entries: [
					{
						name: "optional",
						load: () => ({
							default: defineRawCommand({
								name: "optional",
								summary: "Optional.",
								description: "Optional.",
								run: () => ok({}),
							}),
						}),
					},
				],
			},
			{ displayPath: "@example/consumer/ns-extension" },
		);

		expect(entries).toEqual([
			expect.objectContaining({
				name: "optional",
				requiresExtensions: ["@example/provider"],
				helpGroup: NS_EXTENSION_HELP_GROUP,
			}),
		]);
	});

	test.each([
		[
			"descriptor root",
			{
				group: "probe",
				description: "Probe things.",
				entries: [
					{
						group: "exec",
						hidden: true,
						description: "Agent-only probe commands.",
						entries: [
							{
								name: "run",
								load: () => ({
									default: defineRawCommand({
										name: "run",
										summary: "Run.",
										description: "Run.",
										run: () => ok({}),
									}),
								}),
							},
						],
					},
				],
			},
			["probe", "exec", "run"],
			"Probe things.",
			["probe/exec"],
		],
		[
			"first entry group",
			{
				description: "Descriptor commands.",
				entries: [
					{
						group: "probe",
						description: "Probe things.",
						entries: [
							{
								name: "run",
								load: () => ({
									default: defineRawCommand({
										name: "run",
										summary: "Run.",
										description: "Run.",
										run: () => ok({}),
									}),
								}),
							},
						],
					},
				],
			},
			["probe", "run"],
			"Probe things.",
			undefined,
		],
	] as const)(
		"preinstalled %s carries the root group description for help",
		(_case, descriptor, path, groupDescription, hiddenAncestorKeys) => {
			const entries = extensionDescriptorToPreinstalledCatalog(descriptor, {
				displayPath: "@example/probe/ns-extension",
			});

			expect(entries).toEqual([
				expect.objectContaining({
					name: "run",
					path,
					groupDescription,
					...(hiddenAncestorKeys === undefined ? {} : { hiddenAncestorKeys }),
				}),
			]);
		},
	);

	test("preinstalled registrations derive package identities and presented entries together", () => {
		const catalog = preinstalledNsCommandCatalogFromRegistrations([
			{
				packageName: "@example/commands",
				userFacingKind: "extension",
				descriptor: {
					description: "Example commands.",
					entries: (["scan", "doctor"] as const).map((name) => ({
						name,
						load: () => ({
							default: defineRawCommand({
								name,
								summary: `${name}.`,
								description: `${name}.`,
								run: () => ok({}),
							}),
						}),
					})),
				},
				displayPath: "@example/commands/ns-extension",
				helpGroup: "Examples:",
			},
			{
				packageName: "@example/commandless-provider",
				userFacingKind: "built-in",
				descriptor: { description: "Commandless provider." },
				displayPath: "@example/commandless-provider/ns-extension",
			},
		]);

		expect(catalog.extensionPackageNames).toEqual([
			"@example/commands",
			"@example/commandless-provider",
		]);
		expect(catalog.builtInPackageNames).toEqual(["@example/commandless-provider"]);
		expect(catalog.entries).toEqual([
			expect.objectContaining({
				name: "scan",
				packageName: "@example/commands",
				contributionId: "preinstalled:0:@example/commands:@example/commands/ns-extension",
				helpGroup: "Examples:",
				displayPath: "@example/commands/ns-extension#scan",
			}),
			expect.objectContaining({
				name: "doctor",
				packageName: "@example/commands",
				contributionId: "preinstalled:0:@example/commands:@example/commands/ns-extension",
				displayPath: "@example/commands/ns-extension#doctor",
			}),
		]);
	});

	test("built-in registration packages remain present without becoming installed extensions", async () => {
		const catalog = preinstalledNsCommandCatalogFromRegistrations([
			{
				packageName: "@example/internal-architecture",
				userFacingKind: "built-in",
				descriptor: { description: "Distribution functionality." },
				displayPath: "@example/internal-architecture/ns-extension",
			},
		]);
		const loaded = await loadNsCommandCatalog({
			cwd: "/outside/source-checkout",
			preinstalledCommandCatalog: () => catalog,
		});

		expect(loaded.extensionPackageNames.has("@example/internal-architecture")).toBe(true);
		expect(loaded.builtInPackageNames.has("@example/internal-architecture")).toBe(true);
	});

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
import { defineExtension } from "@nseng-ai/sdk";

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
			sourceKind: "local",
			moduleReference: { type: "loaded" },
			source: { level: "project" },
		});
		expect(loaded.candidates.get("tools/exec/doctor")).toMatchObject({
			name: "doctor",
			segments: ["tools", "exec", "doctor"],
			groupDescription: "Tool commands.",
			sourceKind: "local",
			hiddenAncestorKeys: ["tools/exec"],
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
					hiddenAncestorKeys: ["tools/exec"],
				}),
			]),
		);
	});

	test("project requirements use all successfully declared package identities regardless of order", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeWorkspaceFile(
			join(workspace.cwd, "ns.toml"),
			'extensions = ["./extensions/consumer", "./extensions/provider"]\n',
		);
		writeDescriptorPackage({
			cwd: workspace.cwd,
			directoryName: "provider",
			packageName: "@example/provider",
			descriptorSource: `
import { defineExtension } from "@nseng-ai/sdk";
export default defineExtension({ description: "Provider extension." });
`,
		});
		writeDescriptorPackage({
			cwd: workspace.cwd,
			directoryName: "consumer",
			packageName: "@example/consumer",
			descriptorSource: `
import { defineExtension } from "@nseng-ai/sdk";
const command = { name: "optional", summary: "Optional.", description: "Optional.", run: () => ({ type: "ok", data: {} }) };
export default defineExtension({
  group: "consumer",
  description: "Consumer commands.",
  requiresExtensions: ["@example/provider"],
  entries: [
    { name: "always", load: () => ({ default: { ...command, name: "always" } }) },
    { name: "optional", load: () => ({ default: command }) },
  ],
});
`,
		});

		const loaded = await loadNsCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(loaded.candidates.has("consumer/always")).toBe(true);
		expect(loaded.candidates.has("consumer/optional")).toBe(true);
		expect([...loaded.extensionPackageNames]).toEqual(
			expect.arrayContaining(["@example/provider", "@example/consumer"]),
		);
	});

	test("missing or invalid project packages reject every command in the requiring package", async () => {
		for (const providerState of ["missing", "invalid"] as const) {
			const workspace = await createExtensionRegistryWorkspace();
			writeWorkspaceFile(
				join(workspace.cwd, "ns.toml"),
				providerState === "missing"
					? 'extensions = ["./extensions/consumer"]\n'
					: 'extensions = ["./extensions/consumer", "./extensions/provider"]\n',
			);
			writeDescriptorPackage({
				cwd: workspace.cwd,
				directoryName: "consumer",
				packageName: "@example/consumer",
				descriptorSource: `
import { defineExtension } from "@nseng-ai/sdk";
const command = { name: "optional", summary: "Optional.", description: "Optional.", run: () => ({ type: "ok", data: {} }) };
export default defineExtension({
  group: "consumer",
  description: "Consumer commands.",
  requiresExtensions: ["@example/provider"],
  entries: [
    { name: "always", load: () => ({ default: { ...command, name: "always" } }) },
    { name: "optional", load: () => ({ default: command }) },
  ],
});
`,
			});
			if (providerState === "invalid") {
				writeDescriptorPackage({
					cwd: workspace.cwd,
					directoryName: "provider",
					packageName: "@example/provider",
					descriptorSource: "export default { entries: [] };\n",
				});
			}

			const loaded = await loadNsCommandCatalog({
				cwd: workspace.cwd,
				homeDir: workspace.homeDir,
			});

			expect(loaded.candidates.has("consumer/always")).toBe(false);
			expect(loaded.candidates.has("consumer/optional")).toBe(false);
			expect(loaded.extensionPackageNames.has("@example/provider")).toBe(false);
			if (providerState === "invalid") {
				expect(loaded.diagnostics).toEqual(
					expect.arrayContaining([
						expect.objectContaining({ code: "extension_descriptor_invalid" }),
					]),
				);
			}
		}
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
			preinstalledCommandCatalog: () =>
				preinstalledCatalog([loadedEntry("one"), loadedEntry("two")]),
		});

		const listing = await loadListingCommandInfos(loaded);

		expect(listing.diagnostics).toEqual([]);
		expect(listing.commandInfos).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "one",
					description: "one summary",
					helpGroup: NS_EXTENSION_HELP_GROUP,
				}),
				expect.objectContaining({
					name: "two",
					description: "two summary",
					helpGroup: NS_EXTENSION_HELP_GROUP,
				}),
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
import { defineExtension } from "@nseng-ai/sdk";

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
import { defineExtension } from "@nseng-ai/sdk";

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

	test("an absent user config contributes no diagnostics or declarations", async () => {
		const workspace = await createExtensionRegistryWorkspace();

		const loaded = await loadNsCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(loaded.diagnostics).toEqual([]);
		expect([...loaded.candidates.keys()]).toEqual(builtInCandidateKeys);
	});

	test("user contributions hide fail-closed without an enabling Active harness", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const userRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "gated",
			packageName: "@example/gated",
			descriptorSource: descriptorSource({
				group: "gated",
				packageLabel: "gated",
				commandNames: ["scan"],
			}),
		});
		writeUserConfig(
			workspace,
			`${piSupportedHarnessesLine}extensions = [${JSON.stringify(userRoot)}]\n`,
		);

		for (const env of [{}, { NS_HARNESS: "" }, { NS_HARNESS: "   " }, { NS_HARNESS: "codex" }]) {
			const loaded = await loadNsCommandCatalog({
				cwd: workspace.cwd,
				homeDir: workspace.homeDir,
				env,
			});

			expect(loaded.candidates.has("gated/scan")).toBe(false);
			expect([...loaded.candidates.keys()]).toEqual(builtInCandidateKeys);
			expect(loaded.diagnostics).toEqual([]);
		}
	});

	test("an unknown NS_HARNESS disables the user layer with one actionable diagnostic", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const userRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "gated",
			packageName: "@example/gated",
			descriptorSource: descriptorSource({
				group: "gated",
				packageLabel: "gated",
				commandNames: ["scan"],
			}),
		});
		writeUserConfig(
			workspace,
			`${piSupportedHarnessesLine}extensions = [${JSON.stringify(userRoot)}]\n`,
		);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { NS_HARNESS: "browser" },
		});

		expect(loaded.candidates.has("gated/scan")).toBe(false);
		expect(loaded.diagnostics).toEqual([
			expect.objectContaining({
				code: "user_extension_layer_unknown_harness",
				sourceLevel: "user",
				message: expect.stringContaining('NS_HARNESS="browser"'),
			}),
		]);
		const classified = classifyExtensionDiagnosticsForInvocation({
			diagnostics: loaded.diagnostics,
			requestedCommandName: "other",
			selectedCandidate: undefined,
		});
		expect(classified.fatal).toEqual([]);
		expect(classified.warnings).toHaveLength(1);
	});

	test("a user config without supported_harnesses keeps declarations dormant", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const userRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "gated",
			packageName: "@example/gated",
			descriptorSource: descriptorSource({
				group: "gated",
				packageLabel: "gated",
				commandNames: ["scan"],
			}),
		});
		writeUserConfig(workspace, `extensions = [${JSON.stringify(userRoot)}]\n`);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv },
		});

		expect(loaded.candidates.has("gated/scan")).toBe(false);
		expect([...loaded.candidates.keys()]).toEqual(builtInCandidateKeys);
		expect(loaded.diagnostics).toEqual([]);
	});

	test("invalid supported_harnesses disables the layer with a source-labelled diagnostic", async () => {
		const cases = [
			'supported_harnesses = ["claude"]\n',
			"supported_harnesses = []\n",
			'supported_harnesses = "pi"\n',
		] as const;
		for (const supportedHarnessesLine of cases) {
			const workspace = await createExtensionRegistryWorkspace();
			const userRoot = writeUserDescriptorPackage(workspace, {
				directoryName: "gated",
				packageName: "@example/gated",
				descriptorSource: descriptorSource({
					group: "gated",
					packageLabel: "gated",
					commandNames: ["scan"],
				}),
			});
			writeUserConfig(
				workspace,
				`${supportedHarnessesLine}extensions = [${JSON.stringify(userRoot)}]\n`,
			);

			const loaded = await loadNsCommandCatalog({
				cwd: workspace.cwd,
				homeDir: workspace.homeDir,
				env: { ...piHarnessEnv },
			});

			expect(loaded.candidates.has("gated/scan")).toBe(false);
			expect(loaded.diagnostics).toEqual([
				expect.objectContaining({
					code: "user_supported_harnesses_invalid",
					sourceLevel: "user",
					path: join(workspace.homeDir, ".config", "ns", "ns.toml"),
				}),
			]);
		}
	});

	test("NS_HARNESS invocation aliases normalize to canonical ids", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const userRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "gated",
			packageName: "@example/gated",
			descriptorSource: descriptorSource({
				group: "gated",
				packageLabel: "gated",
				commandNames: ["scan"],
			}),
		});
		writeUserConfig(
			workspace,
			`supported_harnesses = ["claude-code"]\nextensions = [${JSON.stringify(userRoot)}]\n`,
		);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { NS_HARNESS: "claude" },
		});

		expect(loaded.candidates.get("gated/scan")).toMatchObject({ source: { level: "user" } });
	});

	test("project descriptors remain usable while the user layer is disabled", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const userRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "gated",
			packageName: "@example/gated",
			descriptorSource: descriptorSource({
				group: "gated",
				packageLabel: "gated",
				commandNames: ["scan"],
			}),
		});
		writeUserConfig(
			workspace,
			`${piSupportedHarnessesLine}extensions = [${JSON.stringify(userRoot)}]\n`,
		);
		writeWorkspaceFile(join(workspace.cwd, "ns.toml"), 'extensions = ["./extensions/project"]\n');
		writeDescriptorPackage({
			cwd: workspace.cwd,
			directoryName: "project",
			packageName: "@example/project-tools",
			descriptorSource: descriptorSource({
				group: "project",
				packageLabel: "project",
				commandNames: ["scan"],
			}),
		});

		const loaded = await loadNsCommandCatalog({ cwd: workspace.cwd, homeDir: workspace.homeDir });

		expect(loaded.candidates.has("gated/scan")).toBe(false);
		expect(loaded.candidates.get("project/scan")).toMatchObject({ source: { level: "project" } });
		expect(loaded.diagnostics).toEqual([]);
	});

	test("HOME fallback is used only when XDG_CONFIG_HOME is absent", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const fallbackRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "fallback",
			packageName: "@example/fallback",
			descriptorSource: descriptorSource({
				group: "fallback",
				packageLabel: "fallback",
				commandNames: ["scan"],
			}),
		});
		const xdgRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "xdg",
			packageName: "@example/xdg",
			descriptorSource: descriptorSource({
				group: "xdg",
				packageLabel: "xdg",
				commandNames: ["scan"],
			}),
		});
		writeUserConfig(
			workspace,
			`${piSupportedHarnessesLine}extensions = [${JSON.stringify(fallbackRoot)}]\n`,
		);
		const xdgConfigHome = join(workspace.homeDir, "xdg");
		writeWorkspaceFile(
			join(xdgConfigHome, "ns", "ns.toml"),
			`${piSupportedHarnessesLine}extensions = [${JSON.stringify(xdgRoot)}]\n`,
		);

		const fallback = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv },
		});
		const xdg = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv, XDG_CONFIG_HOME: xdgConfigHome },
		});

		expect(fallback.candidates.has("fallback/scan")).toBe(true);
		expect(fallback.candidates.has("xdg/scan")).toBe(false);
		expect(xdg.candidates.has("xdg/scan")).toBe(true);
		expect(xdg.candidates.has("fallback/scan")).toBe(false);
	});

	test("user config path resolution failures are isolated", async () => {
		const workspace = await createExtensionRegistryWorkspace();

		const loaded = await loadNsCommandCatalog({ cwd: workspace.cwd, env: { ...piHarnessEnv } });

		expect([...loaded.candidates.keys()]).toEqual(builtInCandidateKeys);
		expect(loaded.diagnostics).toEqual([
			expect.objectContaining({ code: "user_ns_toml_path_invalid", sourceLevel: "user" }),
		]);
	});

	test("user config non-file, read, TOML, and extensions failures are isolated", async () => {
		const cases = [
			{ name: "non-file", source: undefined, code: "user_ns_toml_not_file" },
			{ name: "read", source: "extensions = []\n", code: "user_ns_toml_read_failed" },
			{ name: "toml", source: "extensions = [", code: "ns_toml_invalid" },
			{ name: "extensions", source: 'extensions = "bad"\n', code: "ns_toml_extensions_invalid" },
		] as const;
		for (const fixture of cases) {
			const workspace = await createExtensionRegistryWorkspace();
			const configPath = join(workspace.homeDir, ".config", "ns", "ns.toml");
			if (fixture.source === undefined) mkdirSync(configPath, { recursive: true });
			else writeWorkspaceFile(configPath, fixture.source);
			if (fixture.name === "read") chmodSync(configPath, 0o000);

			const loaded = await loadNsCommandCatalog({
				cwd: workspace.cwd,
				homeDir: workspace.homeDir,
				env: { ...piHarnessEnv },
			});

			if (fixture.name === "read") chmodSync(configPath, 0o600);
			expect([...loaded.candidates.keys()]).toEqual(builtInCandidateKeys);
			expect(loaded.diagnostics).toEqual([
				expect.objectContaining({ code: fixture.code, sourceLevel: "user", path: configPath }),
			]);
		}
	});

	test("user descriptors load from the single XDG config path and ignore unrelated fields", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const packageRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "tools",
			packageName: "@example/user-tools",
			descriptorSource: `
import { defineExtension } from "@nseng-ai/sdk";
const command = { name: "scan", summary: "User scan.", description: "User scan.", run: () => ({ type: "ok", data: {} }) };
export default defineExtension({ group: "tools", description: "User tools.", entries: [{ name: "scan", load: () => ({ default: command }) }] });
`,
		});
		writeUserConfig(
			workspace,
			`extensions = [${JSON.stringify(packageRoot)}]\n${piSupportedHarnessesLine}[points]\nfoo = "ignored"\n`,
		);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv },
		});

		expect(loaded.candidates.get("tools/scan")).toMatchObject({
			source: { level: "user" },
		});
		expect(loaded.extensionPackageNames.has("@example/user-tools")).toBe(true);
	});

	test("XDG_CONFIG_HOME selects exactly one user config and missing npm packages stay isolated", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const xdgConfigHome = join(workspace.homeDir, "custom-config");
		writeUserConfig(workspace, `${piSupportedHarnessesLine}extensions = ["/must-not-load"]\n`);
		writeWorkspaceFile(
			join(xdgConfigHome, "ns", "ns.toml"),
			`${piSupportedHarnessesLine}extensions = ["./relative", "npm:@example/managed"]\n`,
		);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv, XDG_CONFIG_HOME: xdgConfigHome },
		});

		expect([...loaded.candidates.keys()]).toEqual(builtInCandidateKeys);
		expect(loaded.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "extension_descriptor_relative_local_source_unsupported",
					sourceLevel: "user",
					path: "./relative",
				}),
				expect.objectContaining({
					code: "extension_descriptor_package_missing",
					sourceLevel: "user",
					path: join(
						workspace.homeDir,
						".local",
						"share",
						"ns",
						"extensions",
						"npm",
						"@example",
						"managed",
						"node_modules",
						"@example",
						"managed",
						"package.json",
					),
				}),
			]),
		);
		expect(loaded.extensionPackageNames.has("@example/managed")).toBe(false);
	});

	test("user npm descriptors load from XDG data storage independently of cwd", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const xdgDataHome = join(workspace.homeDir, "custom-data");
		const extensionsDataRoot = join(xdgDataHome, "ns", "extensions");
		const packageRoot = writeManagedUserNpmDescriptorPackage({
			extensionsDataRoot,
			packageName: "@example/managed",
			descriptorSource: descriptorSource({
				group: "managed",
				packageLabel: "managed",
				commandNames: ["scan"],
			}),
		});
		writeUserConfig(
			workspace,
			`${piSupportedHarnessesLine}extensions = ["npm:@example/managed@1.0.0"]\n`,
		);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv, XDG_DATA_HOME: xdgDataHome },
		});

		expect(loaded.diagnostics).toEqual([]);
		expect(loaded.candidates.get("managed/scan")).toMatchObject({
			entryPath: join(packageRoot, "src", "ns-extension.ts"),
			packageName: "@example/managed",
			source: { level: "user" },
		});
	});

	test("invalid XDG data paths isolate npm while preserving local user and built-in commands", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const localRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "local",
			packageName: "@example/local",
			descriptorSource: descriptorSource({
				group: "local",
				packageLabel: "local",
				commandNames: ["scan"],
			}),
		});
		const xdgConfigHome = join(workspace.homeDir, "config-without-home");
		writeWorkspaceFile(
			join(xdgConfigHome, "ns", "ns.toml"),
			`${piSupportedHarnessesLine}extensions = [${JSON.stringify(localRoot)}, "npm:@example/managed"]\n`,
		);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			env: {
				...piHarnessEnv,
				HOME: undefined,
				XDG_CONFIG_HOME: xdgConfigHome,
				XDG_DATA_HOME: "relative-data",
			},
		});

		expect(loaded.candidates.has("local/scan")).toBe(true);
		for (const key of builtInCandidateKeys) expect(loaded.candidates.has(key)).toBe(true);
		expect(loaded.candidates.has("managed/scan")).toBe(false);
		expect(loaded.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "user_extensions_data_path_invalid",
					sourceLevel: "user",
					message: expect.stringContaining("User extension configuration"),
				}),
				expect.objectContaining({
					code: "extension_descriptor_npm_unavailable",
					sourceLevel: "user",
				}),
			]),
		);
	});

	test("absolute user locals load while relative locals are rejected without affecting the absolute package", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const absoluteRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "absolute",
			packageName: "@example/absolute",
			descriptorSource: descriptorSource({
				group: "absolute",
				packageLabel: "absolute",
				commandNames: ["scan"],
			}),
		});
		writeUserConfig(
			workspace,
			`${piSupportedHarnessesLine}extensions = ["./relative", ${JSON.stringify(absoluteRoot)}]\n`,
		);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv },
		});

		expect(loaded.candidates.has("absolute/scan")).toBe(true);
		expect(loaded.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "extension_descriptor_relative_local_source_unsupported",
					sourceLevel: "user",
				}),
			]),
		);
	});

	test("cross-level collisions admit the whole highest package and remain lazy", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		let preinstalledLoads = 0;
		const userRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "user-tools",
			packageName: "@example/user-tools",
			descriptorSource: descriptorSource({
				group: "tools",
				packageLabel: "user",
				commandNames: ["scan"],
			}),
		});
		writeUserConfig(
			workspace,
			`${piSupportedHarnessesLine}extensions = [${JSON.stringify(userRoot)}]\n`,
		);
		writeWorkspaceFile(join(workspace.cwd, "ns.toml"), 'extensions = ["./extensions/project"]\n');
		writeDescriptorPackage({
			cwd: workspace.cwd,
			directoryName: "project",
			packageName: "@example/project-tools",
			descriptorSource: descriptorSource({
				group: "tools",
				packageLabel: "project",
				commandNames: ["scan"],
			}),
		});

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv },
			preinstalledCommandCatalog: () =>
				preinstalledCatalog([
					{
						...preinstalledEntry("tools", "scan", "unused"),
						displayPath: "preinstalled#tools/scan",
						load: () => {
							preinstalledLoads += 1;
							return defineRawCommand({
								name: "scan",
								summary: "preinstalled",
								description: "preinstalled",
								run: () => ok({}),
							});
						},
					},
				]),
		});

		expect(loaded.candidates.get("tools/scan")?.source.level).toBe("project");
		expect(loaded.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "extension_package_lower_level_conflict",
					sourceLevel: "user",
				}),
				expect.objectContaining({
					code: "extension_package_lower_level_conflict",
					sourceLevel: "preinstalled",
				}),
			]),
		);
		expect(preinstalledLoads).toBe(0);
	});

	test("same-scope distinct sources with one manifest name both contribute", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const first = writeUserDescriptorPackage(workspace, {
			directoryName: "first",
			packageName: "@example/duplicate",
			descriptorSource: descriptorSource({
				group: "first",
				packageLabel: "first",
				commandNames: ["one"],
			}),
		});
		const second = writeUserDescriptorPackage(workspace, {
			directoryName: "second",
			packageName: "@example/duplicate",
			descriptorSource: descriptorSource({
				group: "second",
				packageLabel: "second",
				commandNames: ["two"],
			}),
		});
		writeUserConfig(
			workspace,
			`${piSupportedHarnessesLine}extensions = [${JSON.stringify(first)}, ${JSON.stringify(second)}]\n`,
		);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv },
		});

		expect(loaded.candidates.has("first/one")).toBe(true);
		expect(loaded.candidates.has("second/two")).toBe(true);
		expect(loaded.extensionPackageNames.has("@example/duplicate")).toBe(true);
		expect(loaded.diagnostics).toEqual([]);
	});

	test("project and user sources with one manifest name still use source-stable package admission", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const userRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "shared",
			packageName: "@example/shared",
			descriptorSource: descriptorSource({
				group: "shared",
				packageLabel: "user",
				commandNames: ["common", "user-only"],
			}),
		});
		writeUserConfig(
			workspace,
			`${piSupportedHarnessesLine}extensions = [${JSON.stringify(userRoot)}]\n`,
		);
		writeWorkspaceFile(join(workspace.cwd, "ns.toml"), 'extensions = ["./extensions/shared"]\n');
		writeDescriptorPackage({
			cwd: workspace.cwd,
			directoryName: "shared",
			packageName: "@example/shared",
			descriptorSource: descriptorSource({
				group: "shared",
				packageLabel: "project",
				commandNames: ["common", "project-only"],
			}),
		});

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv },
		});

		expect(loaded.candidates.get("shared/common")?.source.level).toBe("project");
		expect(loaded.candidates.has("shared/project-only")).toBe(true);
		expect(loaded.candidates.has("shared/user-only")).toBe(false);
		expect(loaded.diagnostics).toEqual([
			expect.objectContaining({
				code: "extension_package_lower_level_conflict",
				packageName: "@example/shared",
				sourceLevel: "user",
			}),
		]);
	});

	test("a project declaration suppresses the same user source before loading", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeUserConfig(workspace, `${piSupportedHarnessesLine}extensions = ["npm:@example/shared"]\n`);
		writeWorkspaceFile(join(workspace.cwd, "ns.toml"), 'extensions = ["npm:@example/shared"]\n');

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv },
			preinstalledCommandCatalog: () =>
				preinstalledCatalog(
					[
						{
							...preinstalledEntry("consumer", "optional", "@example/consumer/optional"),
							requiresExtensions: ["@example/shared"],
						},
					],
					["@example/consumer"],
				),
		});

		expect(loaded.candidates.has("consumer/optional")).toBe(false);
		expect(loaded.extensionPackageNames.has("@example/shared")).toBe(false);
		expect(loaded.diagnostics).toEqual([
			expect.objectContaining({
				code: "extension_descriptor_package_missing",
				sourceLevel: "project",
			}),
			expect.objectContaining({
				code: "extension_package_requirement_unsatisfied",
				packageName: "@example/consumer",
			}),
		]);
	});

	test("an uncorrelatable broken project local leaves unrelated user identities active", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const userRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "user",
			packageName: "@example/user",
			descriptorSource: descriptorSource({
				group: "user",
				packageLabel: "user",
				commandNames: ["scan"],
			}),
		});
		writeUserConfig(
			workspace,
			`${piSupportedHarnessesLine}extensions = [${JSON.stringify(userRoot)}]\n`,
		);
		writeWorkspaceFile(join(workspace.cwd, "ns.toml"), 'extensions = ["./extensions/missing"]\n');

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv },
		});

		expect(loaded.candidates.has("user/scan")).toBe(true);
		expect(loaded.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "extension_descriptor_package_missing",
					sourceLevel: "project",
				}),
			]),
		);
	});

	test("cross-level command versus group shape uses higher-level whole-shape precedence", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const userRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "user",
			packageName: "@example/user-shape",
			descriptorSource: descriptorSource({
				group: "tools",
				packageLabel: "user",
				commandNames: ["scan", "doctor"],
			}),
		});
		writeUserConfig(
			workspace,
			`${piSupportedHarnessesLine}extensions = [${JSON.stringify(userRoot)}]\n`,
		);
		writeWorkspaceFile(join(workspace.cwd, "ns.toml"), 'extensions = ["./extensions/project"]\n');
		writeDescriptorPackage({
			cwd: workspace.cwd,
			directoryName: "project",
			packageName: "@example/project-shape",
			descriptorSource: descriptorSource({
				group: "root",
				packageLabel: "project",
				commandNames: ["other"],
			}).replace('group: "root",', ""),
		});
		// Use a top-level command named tools, which cannot coexist with tools/* in one CLI tree.
		const projectDescriptorPath = join(
			workspace.cwd,
			"extensions",
			"project",
			"src",
			"ns-extension.ts",
		);
		writeWorkspaceFile(
			projectDescriptorPath,
			`import { defineExtension } from "@nseng-ai/sdk";\nconst command = { name: "tools", summary: "Tools.", description: "Tools.", run: () => ({ type: "ok", data: {} }) };\nexport default defineExtension({ description: "Project.", entries: [{ name: "tools", load: () => ({ default: command }) }] });\n`,
		);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv },
		});

		expect(loaded.candidates.has("tools")).toBe(true);
		expect(loaded.candidates.has("tools/scan")).toBe(false);
		expect(loaded.candidates.has("tools/doctor")).toBe(false);
		expect(loaded.diagnostics).toEqual([
			expect.objectContaining({
				code: "extension_package_lower_level_conflict",
				commandName: "tools/scan",
				packageName: "@example/user-shape",
			}),
		]);
	});

	test("same-level exact and nested path-shape collisions exclude every participant", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			preinstalledCommandCatalog: () =>
				preinstalledCatalog([
					{
						name: "tools",
						description: "tools",
						fullDescription: "tools",
						moduleSpecifier: "@example/top",
					},
					preinstalledEntry("tools", "scan", "@example/scan-one"),
					preinstalledEntry("tools", "scan", "@example/scan-two"),
					{
						name: "deep",
						path: ["tools", "scan", "deep"],
						description: "deep",
						fullDescription: "deep",
						moduleSpecifier: "@example/deep",
					},
				]),
		});

		expect(loaded.candidates.has("tools")).toBe(false);
		expect(loaded.candidates.has("tools/scan")).toBe(false);
		expect(loaded.candidates.has("tools/scan/deep")).toBe(false);
		expect(loaded.diagnostics).toHaveLength(4);
		expect(loaded.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "extension_package_same_level_conflict" }),
			]),
		);
	});

	test("built-in collisions from preinstalled, user, and project remain reserved", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const userRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "user-built-in",
			packageName: "@example/user-built-in",
			descriptorSource: descriptorSource({
				group: "extension",
				packageLabel: "user",
				commandNames: ["point"],
			}),
		});
		writeUserConfig(
			workspace,
			`${piSupportedHarnessesLine}extensions = [${JSON.stringify(userRoot)}]\n`,
		);
		writeWorkspaceFile(join(workspace.cwd, "ns.toml"), 'extensions = ["./extensions/project"]\n');
		writeDescriptorPackage({
			cwd: workspace.cwd,
			directoryName: "project",
			packageName: "@example/project-built-in",
			descriptorSource: descriptorSource({
				group: "extension",
				packageLabel: "project",
				commandNames: ["points"],
			}),
		});

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv },
			preinstalledCommandCatalog: () =>
				preinstalledCatalog([
					preinstalledEntry("extension", "point", "@example/preinstalled-point"),
				]),
		});

		expect(loaded.candidates.get("extension/point")?.source.level).toBe("built-in");
		expect(loaded.candidates.get("extension/points")?.source.level).toBe("built-in");
		const collisions = loaded.diagnostics.filter(
			(diagnostic) => diagnostic.code === "extension_package_builtin_conflict",
		);
		expect(collisions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ sourceLevel: "preinstalled", commandName: "extension/point" }),
				expect.objectContaining({ sourceLevel: "user", commandName: "extension/point" }),
			]),
		);
		expect(loaded.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "extension_package_builtin_conflict",
					sourceLevel: "project",
					affectedCommandNames: ["extension/points"],
				}),
			]),
		);
		const selected = loaded.candidates.get("extension/point");
		const selectedClassification = classifyExtensionDiagnosticsForInvocation({
			diagnostics: loaded.diagnostics,
			requestedCommandName: "extension/point",
			selectedCandidate: selected,
		});
		expect(selectedClassification.fatal).toHaveLength(2);
		expect(selectedClassification.warnings).toEqual(
			expect.arrayContaining([expect.objectContaining({ commandName: "extension/points" })]),
		);
		const unrelatedClassification = classifyExtensionDiagnosticsForInvocation({
			diagnostics: loaded.diagnostics,
			requestedCommandName: "other",
			selectedCandidate: undefined,
		});
		expect(unrelatedClassification.fatal).toEqual([]);
		expect(unrelatedClassification.warnings).toHaveLength(3);
	});

	test("one command shape collision reports every affected built-in path", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const userRoot = writeUserDescriptorPackage(workspace, {
			directoryName: "extension-command",
			packageName: "@example/extension-command",
			descriptorSource: `
import { defineExtension } from "@nseng-ai/sdk";
const command = { name: "extension", summary: "extension", description: "extension", run: () => ({ type: "ok", data: {} }) };
export default defineExtension({ description: "Extension command.", entries: [{ name: "extension", load: () => ({ default: command }) }] });
`,
		});
		writeUserConfig(
			workspace,
			`${piSupportedHarnessesLine}extensions = [${JSON.stringify(userRoot)}]\n`,
		);

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			env: { ...piHarnessEnv },
		});

		expect(loaded.candidates.has("extension")).toBe(false);
		expect(loaded.diagnostics).toEqual([
			expect.objectContaining({
				code: "extension_package_builtin_conflict",
				commandName: "extension",
				affectedCommandNames: ["extension/point", "extension/points"],
			}),
		]);
		for (const commandName of builtInCandidateKeys) {
			const classified = classifyExtensionDiagnosticsForInvocation({
				diagnostics: loaded.diagnostics,
				requestedCommandName: commandName,
				selectedCandidate: loaded.candidates.get(commandName),
			});
			expect(classified.fatal).toEqual([
				expect.objectContaining({
					commandName: "extension",
					affectedCommandNames: expect.arrayContaining([commandName]),
					sourceLevel: "user",
				}),
			]);
		}
	});

	test("project overrides preserve extension presentation but cannot replace built-in namespace commands", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeWorkspaceFile(
			join(workspace.cwd, "ns.toml"),
			'extensions = ["./extensions/direct", "./extensions/nested"]\n',
		);
		writeDescriptorPackage({
			cwd: workspace.cwd,
			directoryName: "direct",
			packageName: "@example/direct",
			descriptorSource: `
import { defineExtension } from "@nseng-ai/sdk";
const command = { name: "hello", summary: "Project hello.", description: "Project hello.", run: () => ({ type: "ok", data: {} }) };
export default defineExtension({ description: "Direct commands.", entries: [{ name: "hello", load: () => ({ default: command }) }] });
`,
		});
		writeDescriptorPackage({
			cwd: workspace.cwd,
			directoryName: "nested",
			packageName: "@example/nested",
			descriptorSource: `
import { defineExtension } from "@nseng-ai/sdk";
const pointCommand = { name: "point", summary: "Project point.", description: "Project point.", run: () => ({ type: "ok", data: {} }) };
const inspectCommand = { name: "inspect", summary: "Project inspect.", description: "Project inspect.", run: () => ({ type: "ok", data: {} }) };
export default defineExtension({ group: "extension", description: "Extension commands.", entries: [
  { name: "point", load: () => ({ default: pointCommand }) },
  { name: "inspect", load: () => ({ default: inspectCommand }) },
] });
`,
		});

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			preinstalledCommandCatalog: () =>
				preinstalledCatalog([
					{
						name: "hello",
						description: "Distribution hello.",
						fullDescription: "Distribution hello.",
						moduleSpecifier: "@example/distribution/hello",
					},
				]),
		});

		expect(loaded.candidates.get("hello")).toMatchObject({
			source: { level: "project" },
			helpGroup: NS_EXTENSION_HELP_GROUP,
		});
		expect(loaded.candidates.get("extension/point")).toMatchObject({
			source: { level: "built-in" },
			helpGroup: NS_BUILT_IN_HELP_GROUP,
		});
		expect(loaded.candidates.has("extension/inspect")).toBe(false);
		expect(loaded.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "extension_package_lower_level_conflict",
					commandName: "hello",
					packageName: "@example/distribution",
				}),
				expect.objectContaining({
					code: "extension_package_builtin_conflict",
					commandName: "extension/point",
					packageName: "@example/nested",
					affectedCommandNames: ["extension/point"],
				}),
			]),
		);
	});

	test("preinstalled extension commands merge with the built-in extension group", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			preinstalledCommandCatalog: () =>
				preinstalledCatalog([
					preinstalledEntry(
						"extension",
						"install",
						"@nseng-ai/ns-init/ns/commands/extension-install",
					),
				]),
		});

		expect(hasExtensionErrors(loaded.diagnostics)).toBe(false);
		expect([...loaded.candidates.keys()]).toEqual([
			"extension/install",
			"extension/point",
			"extension/points",
		]);
		expect(loaded.candidates.get("extension/install")).toMatchObject({
			group: "extension",
			name: "install",
			source: { level: "preinstalled" },
		});
		expect(loaded.candidates.has("install")).toBe(false);
	});

	test("injected preinstalled catalog contributes package commands", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			preinstalledCommandCatalog: () =>
				preinstalledCatalog([
					preinstalledEntry("tools", "scan", "@example/tools/ns/commands/scan"),
					preinstalledEntry("tools", "doctor", "@example/tools/ns/commands/doctor"),
				]),
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

	test("preinstalled requirements use explicit catalog identity and omit ineligible side effects", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		let loadCount = 0;
		const gatedEntry = {
			group: "tools",
			groupDescription: "tool commands.",
			name: "points",
			description: "points command.",
			fullDescription: "points command.",
			requiresExtensions: ["@example/provider"],
			displayPath: "@example/consumer/points",
			load: () => {
				loadCount += 1;
				return defineRawCommand({
					name: "points",
					summary: "Override points.",
					description: "Override points.",
					run: () => ok({}),
				});
			},
		};

		const absent = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			preinstalledCommandCatalog: () => preinstalledCatalog([gatedEntry], ["@example/consumer"]),
		});
		expect(absent.candidates.has("tools/points")).toBe(false);
		expect(absent.diagnostics).toEqual([
			expect.objectContaining({
				code: "extension_package_requirement_unsatisfied",
				packageName: "@example/consumer",
			}),
		]);
		expect(loadCount).toBe(0);

		const present = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			preinstalledCommandCatalog: () =>
				preinstalledCatalog([gatedEntry], ["@example/consumer", "@example/provider"]),
		});
		expect(present.candidates.get("tools/points")?.source.level).toBe("preinstalled");
		expect(present.diagnostics).toEqual([]);
		expect(present.extensionPackageNames.has("@example/provider")).toBe(true);
		expect(loadCount).toBe(0);
	});

	test("commandless preinstalled catalog identity satisfies another package requirement", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const gatedEntry = {
			...preinstalledEntry("tools", "optional", "@example/consumer/optional"),
			requiresExtensions: ["@example/commandless-provider"],
		};

		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			preinstalledCommandCatalog: () =>
				preinstalledCatalog([gatedEntry], ["@example/consumer", "@example/commandless-provider"]),
		});

		expect(loaded.candidates.has("tools/optional")).toBe(true);
		expect(loaded.extensionPackageNames.has("@example/commandless-provider")).toBe(true);
	});

	test("thunk-backed preinstalled entries load without package resolution", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const loaded = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
			preinstalledCommandCatalog: () =>
				preinstalledCatalog([
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
				]),
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
				hasExtension: () => false,
				async exec() {
					return { type: "exited", code: 0, signal: null, stdout: "", stderr: "" };
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
			{ name: "hello", helpGroup: "Examples:", sourceKind: "local" },
		);

		expect(info).toEqual({
			name: "hello",
			description: "Say hello.",
			fullDescription: "Say hello.\n\nWith details.",
			helpGroup: "Examples:",
			sourceKind: "local",
			extensionOrigin: "local",
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
