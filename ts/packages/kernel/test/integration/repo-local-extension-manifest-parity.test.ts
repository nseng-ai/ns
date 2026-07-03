import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { addressRepoLocalSdlExtension } from "@ji/address/repo-local-sdl-extension";
import { aretroRepoLocalSdlExtension } from "@ji/aretro/repo-local-sdl-extension";
import { branchContextRepoLocalSdlExtension } from "@ji/branch-context/repo-local-sdl-extension";
import { flowRepoLocalSdlExtension } from "@ji/flow/repo-local-sdl-extension";
import { handoffRepoLocalSdlExtension } from "@ji/handoff/repo-local-sdl-extension";
import { objectiveRepoLocalSdlExtension } from "@ji/objective/repo-local-sdl-extension";
import { roasterRepoLocalSdlExtension } from "@ji/roaster/repo-local-sdl-extension";
import type {
	RepoLocalSdlExtensionCommandDescriptor,
	RepoLocalSdlExtensionDescriptor,
} from "@ji/kernel/sdk";
import {
	discoverSdlPackageCommands,
	type DiscoveredExtensionCommand,
} from "../../src/extensions/discovery.ts";

interface NormalizedManifestCommand {
	readonly name: string;
	readonly path?: readonly string[];
	readonly description: string;
	readonly entry: string;
}

interface DiscoveredManifest {
	readonly group: string;
	readonly description: string;
	readonly commands: readonly DiscoveredExtensionCommand[];
}

const REPO_LOCAL_EXTENSION_ROOT = "../.ji/extensions";
const REPO_LOCAL_EXTENSION_DESCRIPTORS = [
	addressRepoLocalSdlExtension,
	aretroRepoLocalSdlExtension,
	branchContextRepoLocalSdlExtension,
	flowRepoLocalSdlExtension,
	handoffRepoLocalSdlExtension,
	objectiveRepoLocalSdlExtension,
	roasterRepoLocalSdlExtension,
] as const satisfies readonly RepoLocalSdlExtensionDescriptor[];

describe("repo-local SDL extension manifest parity", () => {
	test("has package-owned descriptor parity coverage for every repo-local SDL extension", async () => {
		const extensionDirectoryEntries = await readdir(REPO_LOCAL_EXTENSION_ROOT, {
			withFileTypes: true,
		});
		const actualExtensionGroups = extensionDirectoryEntries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
		const expectedExtensionGroups = REPO_LOCAL_EXTENSION_DESCRIPTORS.map(
			(descriptor) => descriptor.group,
		).sort();

		if (!stringListsEqual(actualExtensionGroups, expectedExtensionGroups)) {
			throw new Error(
				[
					"Repo-local SDL extension descriptor coverage mismatch.",
					`Extension directories: ${actualExtensionGroups.join(", ")}`,
					`Package descriptors: ${expectedExtensionGroups.join(", ")}`,
					"Add exactly one package-owned repo-local descriptor to this test table for each .ji/extensions/* directory.",
				].join("\n"),
			);
		}
	});

	for (const descriptor of REPO_LOCAL_EXTENSION_DESCRIPTORS) {
		test(`${descriptor.group} manifest matches its package-owned descriptor`, async () => {
			const manifest = readDiscoveredManifest(descriptor.group);
			expect(manifest.group).toBe(descriptor.group);
			expect(manifest.description).toBe(descriptor.description);

			const actualCommands = sortCommands(
				manifest.commands.map((command) => normalizeDiscoveredCommand(descriptor.group, command)),
			);
			const expectedCommands = sortCommands(
				descriptor.commands.map((command) => normalizeDescriptorCommand(command)),
			);

			assertNoDuplicateValues(
				`${descriptor.group} manifest compatibility names`,
				actualCommands.map((command) => command.name),
			);
			assertNoDuplicateValues(
				`${descriptor.group} manifest user-facing routes`,
				actualCommands.map((command) => userFacingRouteKey(command)),
			);
			assertManifestCommandsMatch(descriptor.group, actualCommands, expectedCommands);
			assertCommandLeafManifestEntries(descriptor.group, descriptor.commands);

			for (const command of descriptor.commands) {
				await expectManifestEntryExists(descriptor.group, command);
				await expectLocalEntryReferencesPackageExport(descriptor.group, command);
			}
		});
	}
});

function readDiscoveredManifest(group: string): DiscoveredManifest {
	const packageDir = path.join(REPO_LOCAL_EXTENSION_ROOT, group);
	const result = discoverSdlPackageCommands(REPO_LOCAL_EXTENSION_ROOT, packageDir);
	if (result.diagnostics.length > 0) {
		throw new Error(
			[
				`${group} repo-local SDL manifest discovery failed.`,
				...result.diagnostics.map((diagnostic) => diagnostic.message),
			].join("\n"),
		);
	}
	if (result.commands.length === 0) {
		throw new Error(`${group} repo-local SDL manifest did not discover any commands.`);
	}
	assertDiscoveredGroup(group, result.commands);
	return {
		group,
		description: result.commands[0]?.groupDescription ?? "",
		commands: result.commands,
	};
}

function normalizeDiscoveredCommand(
	group: string,
	command: DiscoveredExtensionCommand,
): NormalizedManifestCommand {
	return {
		name: command.name,
		...(command.segments === undefined ? {} : { path: manifestPathFromSegments(group, command) }),
		description: command.description,
		entry: `./${path.relative(path.join(REPO_LOCAL_EXTENSION_ROOT, group), command.entryPath)}`,
	};
}

function normalizeDescriptorCommand(
	command: RepoLocalSdlExtensionCommandDescriptor,
): NormalizedManifestCommand {
	const name = command.manifestName ?? command.command.name;
	return {
		name,
		...(command.manifestPath === undefined ? {} : { path: command.manifestPath }),
		description: command.command.summary,
		entry: command.manifestEntry,
	};
}

function assertDiscoveredGroup(
	group: string,
	commands: readonly DiscoveredExtensionCommand[],
): void {
	for (const command of commands) {
		expect(command.group).toBe(group);
		expect(command.groupDescription).toBeDefined();
	}
}

function manifestPathFromSegments(
	group: string,
	command: DiscoveredExtensionCommand,
): readonly string[] {
	const segments = command.segments;
	if (segments === undefined) return [];
	return segments[0] === group ? segments.slice(1) : segments;
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

function assertNoDuplicateValues(label: string, values: readonly string[]): void {
	const duplicates = duplicateValues(values);
	if (duplicates.length === 0) return;
	throw new Error(`${label} must be unique. Duplicates: ${duplicates.join(", ")}`);
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

function assertCommandLeafManifestEntries(
	group: string,
	commands: readonly RepoLocalSdlExtensionCommandDescriptor[],
): void {
	const nonLeafEntries = commands.filter(
		(command) => !/^\.\/src\/commands\/[a-z0-9-]+\.ts$/.test(command.manifestEntry),
	);
	if (nonLeafEntries.length === 0) return;
	throw new Error(
		[
			`${group} repo-local SDL manifest descriptors must use one command leaf per entry.`,
			"Expected entries under ./src/commands/<command>.ts, not a shared extension multiplexer.",
			...nonLeafEntries.map((command) => `- ${command.manifestEntry}`),
		].join("\n"),
	);
}

function assertManifestCommandsMatch(
	group: string,
	actualCommands: readonly NormalizedManifestCommand[],
	expectedCommands: readonly NormalizedManifestCommand[],
): void {
	const actualByRoute = commandsByRoute(actualCommands);
	const expectedByRoute = commandsByRoute(expectedCommands);
	const missingCommands = expectedCommands.filter(
		(command) => !actualByRoute.has(userFacingRouteKey(command)),
	);
	const unexpectedCommands = actualCommands.filter(
		(command) => !expectedByRoute.has(userFacingRouteKey(command)),
	);
	const mismatchedCommands = expectedCommands.flatMap((expectedCommand) => {
		const actualCommand = actualByRoute.get(userFacingRouteKey(expectedCommand));
		if (actualCommand === undefined || commandsEqual(actualCommand, expectedCommand)) return [];
		return [{ actualCommand, expectedCommand }];
	});

	if (
		missingCommands.length === 0 &&
		unexpectedCommands.length === 0 &&
		mismatchedCommands.length === 0
	) {
		return;
	}

	const lines = [`${group} repo-local SDL manifest does not match its package descriptor.`];
	if (missingCommands.length > 0) {
		lines.push(
			"",
			"Missing manifest command entries (copy into .ji/extensions/" + group + "/package.json):",
			...missingCommands.map((command) => manifestCommandJson(command)),
		);
	}
	if (unexpectedCommands.length > 0) {
		lines.push(
			"",
			"Unexpected manifest command entries (remove or add matching package descriptors):",
			...unexpectedCommands.map((command) => manifestCommandJson(command)),
		);
	}
	if (mismatchedCommands.length > 0) {
		lines.push("", "Mismatched manifest command fields:");
		for (const mismatch of mismatchedCommands) {
			lines.push(
				`- ${userFacingRouteKey(mismatch.expectedCommand)}`,
				`  expected: ${manifestCommandJson(mismatch.expectedCommand)}`,
				`  actual:   ${manifestCommandJson(mismatch.actualCommand)}`,
			);
		}
	}
	throw new Error(lines.join("\n"));
}

function commandsByRoute(
	commands: readonly NormalizedManifestCommand[],
): Map<string, NormalizedManifestCommand> {
	return new Map(commands.map((command) => [userFacingRouteKey(command), command]));
}

function commandsEqual(left: NormalizedManifestCommand, right: NormalizedManifestCommand): boolean {
	return manifestCommandJson(left) === manifestCommandJson(right);
}

function manifestCommandJson(command: NormalizedManifestCommand): string {
	return JSON.stringify(command, null, "\t");
}

async function expectManifestEntryExists(
	group: string,
	command: RepoLocalSdlExtensionCommandDescriptor,
): Promise<void> {
	const entryPath = path.join(REPO_LOCAL_EXTENSION_ROOT, group, command.manifestEntry);
	const expectedLine = `export { default } from "${command.packageExport}";`;
	try {
		await access(entryPath);
	} catch (error) {
		throw new Error(
			[
				`${group} repo-local SDL manifest entry is missing: ${entryPath}`,
				`Expected shim line: ${expectedLine}`,
				"Create the shim file or update the package-owned descriptor/manifest entry path.",
				`Original error: ${String(error)}`,
			].join("\n"),
		);
	}
}

async function expectLocalEntryReferencesPackageExport(
	group: string,
	command: RepoLocalSdlExtensionCommandDescriptor,
): Promise<void> {
	const entryPath = path.join(REPO_LOCAL_EXTENSION_ROOT, group, command.manifestEntry);
	const expectedLine = `export { default } from "${command.packageExport}";`;
	const source = await readFile(entryPath, "utf8");
	if (source.includes(expectedLine)) return;

	throw new Error(
		[
			`${group} repo-local SDL shim does not re-export the descriptor package path: ${entryPath}`,
			`Expected line: ${expectedLine}`,
			"Actual first lines:",
			firstLines(source),
		].join("\n"),
	);
}

function firstLines(source: string): string {
	return source.split("\n").slice(0, 6).join("\n");
}

function stringListsEqual(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
