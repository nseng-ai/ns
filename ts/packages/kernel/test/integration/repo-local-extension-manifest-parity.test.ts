import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import { addressSdlExtensionCommands } from "@sdl/address/sdl-extension-command-registry";
import { aretroSdlExtensionCommands } from "@sdl/aretro/sdl-extension-command-registry";
import { branchContextSdlExtensionCommands } from "@sdl/branch-context/sdl-extension-command-registry";
import { flowSdlExtensionCommands } from "sdl-flow/sdl-extension-command-registry";
import { handoffSdlExtensionCommands } from "@sdl/handoff/sdl-extension-command-registry";
import { objectiveSdlExtensionCommands } from "@sdl/objective/sdl-extension-command-registry";
import { roasterSdlExtensionCommands } from "@sdl/roaster/sdl-extension-command-registry";

interface RepoLocalSdlExtensionCommandRegistryEntry {
	readonly manifestName?: string;
	readonly manifestPath?: readonly string[];
	readonly manifestDescription: string;
	readonly manifestEntry: string;
	readonly packageExport: string;
}

interface RepoLocalSdlExtensionRegistry {
	readonly group: string;
	readonly commands: readonly RepoLocalSdlExtensionCommandRegistryEntry[];
}

interface NormalizedManifestCommand {
	readonly name?: string;
	readonly path?: readonly string[];
	readonly description: string;
	readonly entry: string;
}

const repoLocalExtensionManifestSchema = z.object({
	sdl: z.object({
		group: z.string(),
		commands: z.array(
			z.object({
				name: z.string().optional(),
				path: z.array(z.string()).optional(),
				description: z.string(),
				entry: z.string(),
			}),
		),
	}),
});

const REPO_LOCAL_EXTENSION_ROOT = "../.sdl/extensions";
const REPO_LOCAL_EXTENSION_REGISTRIES: readonly RepoLocalSdlExtensionRegistry[] = [
	{ group: "address", commands: addressSdlExtensionCommands },
	{ group: "aretro", commands: aretroSdlExtensionCommands },
	{ group: "branch-context", commands: branchContextSdlExtensionCommands },
	{ group: "flow", commands: flowSdlExtensionCommands },
	{ group: "handoff", commands: handoffSdlExtensionCommands },
	{ group: "objective", commands: objectiveSdlExtensionCommands },
	{ group: "roaster", commands: roasterSdlExtensionCommands },
];

describe("repo-local SDL extension manifest parity", () => {
	test("has package-owned parity coverage for every repo-local SDL extension", async () => {
		const extensionDirectoryEntries = await readdir(REPO_LOCAL_EXTENSION_ROOT, {
			withFileTypes: true,
		});
		const actualExtensionGroups = extensionDirectoryEntries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
		const expectedExtensionGroups = REPO_LOCAL_EXTENSION_REGISTRIES.map(
			(registry) => registry.group,
		).sort();

		expect(actualExtensionGroups).toEqual(expectedExtensionGroups);
	});

	for (const registry of REPO_LOCAL_EXTENSION_REGISTRIES) {
		test(`${registry.group} manifest matches its package-owned command registry`, async () => {
			const manifest = await readManifest(registry.group);
			expect(manifest.sdl.group).toBe(registry.group);

			const actualCommands = sortCommands(
				manifest.sdl.commands.map((command) => normalizeManifestCommand(command)),
			);
			const expectedCommands = sortCommands(
				registry.commands.map((command) => normalizeRegistryCommand(command)),
			);

			expect(actualCommands).toEqual(expectedCommands);
			expect(
				duplicateValues(manifest.sdl.commands.flatMap((command) => command.name ?? [])),
			).toEqual([]);
			expect(
				duplicateValues(
					manifest.sdl.commands.map((command) => command.path?.join("/") ?? command.name ?? ""),
				),
			).toEqual([]);

			for (const command of registry.commands) {
				await expectManifestEntryExists(registry.group, command.manifestEntry);
				await expectLocalEntryReferencesPackageExport(registry.group, command);
			}
		});
	}
});

async function readManifest(group: string) {
	const manifestText = await readFile(
		path.join(REPO_LOCAL_EXTENSION_ROOT, group, "package.json"),
		"utf8",
	);
	return repoLocalExtensionManifestSchema.parse(JSON.parse(manifestText));
}

function normalizeManifestCommand(
	command: z.infer<typeof repoLocalExtensionManifestSchema>["sdl"]["commands"][number],
): NormalizedManifestCommand {
	return {
		...(command.name === undefined ? {} : { name: command.name }),
		...(command.path === undefined ? {} : { path: command.path }),
		description: command.description,
		entry: command.entry,
	};
}

function normalizeRegistryCommand(
	command: RepoLocalSdlExtensionCommandRegistryEntry,
): NormalizedManifestCommand {
	return {
		...(command.manifestName === undefined ? {} : { name: command.manifestName }),
		...(command.manifestPath === undefined ? {} : { path: command.manifestPath }),
		description: command.manifestDescription,
		entry: command.manifestEntry,
	};
}

function sortCommands(commands: readonly NormalizedManifestCommand[]): NormalizedManifestCommand[] {
	return [...commands].sort((left, right) =>
		userFacingRouteKey(left).localeCompare(userFacingRouteKey(right)),
	);
}

function userFacingRouteKey(command: {
	readonly name?: string;
	readonly path?: readonly string[];
}): string {
	return command.path?.join("/") ?? command.name ?? "";
}

function duplicateValues(values: readonly string[]): string[] {
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) duplicates.add(value);
		seen.add(value);
	}
	return [...duplicates].sort();
}

async function expectManifestEntryExists(group: string, manifestEntry: string): Promise<void> {
	const entryPath = path.join(REPO_LOCAL_EXTENSION_ROOT, group, manifestEntry);
	await expect(access(entryPath)).resolves.toBeUndefined();
}

async function expectLocalEntryReferencesPackageExport(
	group: string,
	command: RepoLocalSdlExtensionCommandRegistryEntry,
): Promise<void> {
	const source = await readFile(
		path.join(REPO_LOCAL_EXTENSION_ROOT, group, command.manifestEntry),
		"utf8",
	);
	if (group === "address") {
		const manifestName = command.manifestName;
		expect(manifestName).toMatch(/^exec-/);
		if (manifestName === undefined)
			throw new Error("Address registry entries must declare manifestName.");
		expect(source).toContain(command.packageExport);
		expect(source).toContain(`prAddressSdlCommand("${manifestName.slice("exec-".length)}")`);
		return;
	}

	expect(source).toContain(command.packageExport);
}
