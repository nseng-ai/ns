import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { inspectClinkrCommandStructure } from "@nseng-ai/clinkr";
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
		const routes = await inspectClinkrCommandStructure(commandDirectory);

		expect(
			routes.filter((route) => route.type === "command").map((route) => route.path.join("/")),
		).toEqual(expectedCommandPaths);
		expect(routes.filter((route) => route.type === "default")).toEqual([]);
		expect(routes.filter((route) => route.type === "group")).toEqual([
			expect.objectContaining({
				type: "group",
				path: ["exec"],
				metadata: expect.objectContaining({ isHidden: true }),
			}),
		]);
	});

	test("keeps eager command metadata modules implementation-free", async () => {
		const metadataFiles = await findMetadataFiles(commandDirectory);
		expect(metadataFiles).toHaveLength(expectedCommandPaths.length);

		for (const metadataFile of metadataFiles) {
			const source = await readFile(metadataFile, "utf8");
			const imports = source.match(/^import .*;$/gm) ?? [];
			expect(imports, metadataFile).toEqual([
				'import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";',
			]);
			expect(source, metadataFile).not.toContain("operations/");
		}
	});
});
