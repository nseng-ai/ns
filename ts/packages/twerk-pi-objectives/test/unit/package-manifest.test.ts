import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
	keywords?: string[];
	pi?: { extensions?: string[] };
};

describe("package manifest", () => {
	test("is discoverable as a Pi package", () => {
		expect(manifest.keywords).toContain("pi-package");
	});

	test("points at the extension entrypoint", () => {
		expect(manifest.pi?.extensions).toEqual(["./src/extension/index.ts"]);
	});
});
