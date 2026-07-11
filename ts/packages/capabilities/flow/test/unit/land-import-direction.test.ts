import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const LAND_STACK_SOURCE_DIRECTORY = join(REPO_ROOT, "ts/packages/capabilities/flow/src/land/stack");

describe("land import direction", () => {
	test("stack modules do not import the parent presentation module", async () => {
		const sourceFiles = (await readdir(LAND_STACK_SOURCE_DIRECTORY))
			.filter((fileName) => fileName.endsWith(".ts"))
			.sort();
		const violations: string[] = [];

		for (const sourceFile of sourceFiles) {
			const source = await readFile(join(LAND_STACK_SOURCE_DIRECTORY, sourceFile), "utf8");
			if (source.includes("../land-presentation")) violations.push(sourceFile);
		}

		expect(violations).toEqual([]);
	});
});
