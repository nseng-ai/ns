import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import { EXEC_OPERATIONS } from "../../src/exec-commands.ts";

const addressExtensionManifestSchema = z.object({
	sdl: z.object({
		commands: z.array(
			z.object({
				name: z.string(),
				description: z.string(),
				entry: z.string(),
			}),
		),
	}),
});

const ADDRESS_EXTENSION_MANIFEST_PATH = "../.sdl/extensions/address/package.json";
const ADDRESS_EXTENSION_EXEC_PATH = "../.sdl/extensions/address/src/commands/exec.ts";

describe("address SDL extension registration", () => {
	test("declares every Address exec operation in the repo-local extension", async () => {
		const manifestText = await readFile(ADDRESS_EXTENSION_MANIFEST_PATH, "utf8");
		const manifest = addressExtensionManifestSchema.parse(JSON.parse(manifestText));
		const actualManifestCommands = manifest.sdl.commands.map((command) => command.name).sort();
		const expectedManifestCommands = EXEC_OPERATIONS.map(
			(operation) => `exec-${operation.name}`,
		).sort();

		expect(actualManifestCommands).toEqual(expectedManifestCommands);
		expect(new Set(actualManifestCommands).size).toBe(actualManifestCommands.length);
		for (const command of manifest.sdl.commands) {
			expect(command.entry).toBe("./src/commands/exec.ts");
			expect(command.description).toBe(
				`Run Address ${command.name.slice("exec-".length)} operation.`,
			);
		}
	});

	test("loads every Address exec operation from the extension command module", async () => {
		const commandSource = await readFile(ADDRESS_EXTENSION_EXEC_PATH, "utf8");
		for (const operation of EXEC_OPERATIONS) {
			expect(commandSource).toContain(`prAddressSdlCommand("${operation.name}")`);
		}
	});
});
