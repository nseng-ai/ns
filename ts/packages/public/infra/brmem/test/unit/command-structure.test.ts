import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const commandDirectory = join(import.meta.dirname, "../../src/cli");
const expectedCliRootEntries = [
	"app.ts",
	"check",
	"copy",
	"delete",
	"exec",
	"export",
	"gc",
	"get",
	"list",
	"put",
	"setup-git",
];
const expectedCommandPaths = [
	"check",
	"copy",
	"delete",
	"exec/resolve-prompt",
	"export",
	"gc",
	"get",
	"list",
	"put",
	"setup-git",
];

async function findMetadataFiles(directory: string): Promise<readonly string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nestedFiles = await Promise.all(
		entries.map(async (entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) return await findMetadataFiles(path);
			return entry.isFile() && entry.name === "metadata.ts" ? [path] : [];
		}),
	);
	return nestedFiles.flat();
}

describe("brmem filesystem command structure", () => {
	test("keeps only the entrypoint and Clinkr routes under src/cli", async () => {
		const entries = await readdir(commandDirectory, { withFileTypes: true });
		expect(entries.map((entry) => entry.name).toSorted()).toEqual(expectedCliRootEntries);
		expect(entries.find((entry) => entry.name === "app.ts")?.isFile()).toBe(true);
		expect(
			entries.filter((entry) => entry.name !== "app.ts").every((entry) => entry.isDirectory()),
		).toBe(true);
	});

	test("exposes the exact command inventory and hidden exec group", async () => {
		const metadataFiles = await findMetadataFiles(commandDirectory);
		const paths = metadataFiles
			.map((file) => file.slice(commandDirectory.length + 1, -"/metadata.ts".length))
			.toSorted();
		expect(paths).toEqual(expectedCommandPaths);
		const groupSource = await readFile(join(commandDirectory, "exec/group.ts"), "utf8");
		expect(groupSource).toContain("hidden: true");
	});

	test("keeps exact command pairs and no legacy operations directory", async () => {
		for (const commandPath of expectedCommandPaths) {
			expect((await readdir(join(commandDirectory, commandPath))).toSorted(), commandPath).toEqual([
				"command.ts",
				"metadata.ts",
			]);
		}
		await expect(access(join(commandDirectory, "../operations"))).rejects.toThrow();
	});

	test("keeps eager command metadata modules implementation-free", async () => {
		const metadataFiles = await findMetadataFiles(commandDirectory);
		expect(metadataFiles).toHaveLength(expectedCommandPaths.length);

		for (const metadataFile of [...metadataFiles, join(commandDirectory, "exec/group.ts")]) {
			const source = await readFile(metadataFile, "utf8");
			const imports = source.match(/^import .*;$/gm) ?? [];
			expect(imports, metadataFile).toHaveLength(1);
			expect(imports[0], metadataFile).toMatch(
				/^import type \{ Clinkr(CommandMetadata|GroupDefinition) \} from "@nseng-ai\/clinkr\/app";$/,
			);
			expect(source, metadataFile).not.toContain("operations/");
		}
	});
});
