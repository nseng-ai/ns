import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import { addressRepoLocalNsExtension } from "../../src/repo-local-ns-extension.ts";

const addressExtensionManifestSchema = z.object({
	ns: z.object({
		commands: z.array(
			z.object({
				name: z.string(),
				description: z.string(),
				entry: z.string(),
			}),
		),
	}),
});

const ADDRESS_EXTENSION_ROOT = "../.ns/extensions/address";
const ADDRESS_EXTENSION_MANIFEST_PATH = path.join(ADDRESS_EXTENSION_ROOT, "package.json");

describe("address ns extension registration", () => {
	test("declares one repo-local shim for every package-owned Address exec command", async () => {
		const manifestText = await readFile(ADDRESS_EXTENSION_MANIFEST_PATH, "utf8");
		const manifest = addressExtensionManifestSchema.parse(JSON.parse(manifestText));
		const actualManifestCommands = manifest.ns.commands
			.map((command) => ({
				name: command.name,
				description: command.description,
				entry: command.entry,
			}))
			.sort((left, right) => left.name.localeCompare(right.name));
		const expectedManifestCommands = addressRepoLocalNsExtension.commands
			.map((command) => ({
				name: command.command.name,
				description: command.command.summary,
				entry: command.manifestEntry,
			}))
			.sort((left, right) => left.name.localeCompare(right.name));

		expect(actualManifestCommands).toEqual(expectedManifestCommands);
		expect(new Set(actualManifestCommands.map((command) => command.name)).size).toBe(
			actualManifestCommands.length,
		);
	});

	test("points every Address manifest entry at its matching public package export", async () => {
		for (const command of addressRepoLocalNsExtension.commands) {
			const commandSource = await readFile(
				path.join(ADDRESS_EXTENSION_ROOT, command.manifestEntry),
				"utf8",
			);
			expect(commandSource).toContain(`export { default } from "${command.packageExport}";`);
		}
	});
});
