import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { inspectClinkrCommandStructure } from "@nseng-ai/clinkr";
import { describe, expect, test } from "vitest";

const commandDirectory = join(import.meta.dirname, "../../src/cli");
const expectedCommandPaths = [
	"objective/check",
	"objective/exec/list-candidates",
	"objective/exec/load-orientations",
	"objective/exec/publication-bind",
	"objective/exec/publication-publish",
	"objective/exec/read-objective",
	"objective/exec/runner-begin",
	"objective/exec/runner-finish",
	"objective/exec/runner-subagent-usage",
	"objective/exec/tracking-gate",
	"objective/list",
	"objective/show",
];

async function findFilesNamed(directory: string, fileName: string): Promise<readonly string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nestedFiles = await Promise.all(
		entries.map(async (entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) return await findFilesNamed(path, fileName);
			return entry.isFile() && entry.name === fileName ? [path] : [];
		}),
	);
	return nestedFiles.flat();
}

describe("objectives filesystem command structure", () => {
	test("keeps only the objective route tree under src/cli", async () => {
		const entries = await readdir(commandDirectory, { withFileTypes: true });
		expect(entries.map((entry) => entry.name)).toEqual(["objective"]);
		expect(entries.every((entry) => entry.isDirectory())).toBe(true);
	});

	test("exposes the exact command inventory and hides only objective/exec", async () => {
		const routes = await inspectClinkrCommandStructure(commandDirectory);

		expect(
			routes.filter((route) => route.type === "command").map((route) => route.path.join("/")),
		).toEqual(expectedCommandPaths);
		expect(routes.filter((route) => route.type === "default")).toEqual([]);
		expect(routes.filter((route) => route.type === "group")).toEqual([
			expect.objectContaining({
				type: "group",
				path: ["objective"],
				metadata: expect.not.objectContaining({ isHidden: true }),
			}),
			expect.objectContaining({
				type: "group",
				path: ["objective", "exec"],
				metadata: expect.objectContaining({ isHidden: true }),
			}),
		]);
	});

	test("keeps eager command metadata modules implementation-free", async () => {
		const metadataFiles = await findFilesNamed(commandDirectory, "metadata.ts");
		expect(metadataFiles).toHaveLength(expectedCommandPaths.length);

		for (const metadataFile of metadataFiles) {
			const source = await readFile(metadataFile, "utf8");
			const imports = source.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
			expect(imports, metadataFile).toEqual([
				'import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";',
			]);
			expect(source, metadataFile).not.toMatch(/from "\.\.?\//);
		}
	});

	test("keeps eager group modules implementation-free", async () => {
		const groupFiles = await findFilesNamed(commandDirectory, "group.ts");
		expect(groupFiles).toHaveLength(2);

		for (const groupFile of groupFiles) {
			const source = await readFile(groupFile, "utf8");
			const imports = source.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
			expect(imports, groupFile).toEqual([
				'import type { ClinkrGroupDefinition } from "@nseng-ai/clinkr";',
			]);
			expect(source, groupFile).not.toMatch(/from "\.\.?\//);
		}
	});
});
