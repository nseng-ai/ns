import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { VERSION } from "../../src/cli.ts";

interface PackageJson {
	name?: unknown;
	version?: unknown;
	bin?: unknown;
	scripts?: unknown;
}

describe("areg package metadata", () => {
	test("declares the standalone areg workspace package", async () => {
		const packageJsonUrl = new URL("../../package.json", import.meta.url);
		const packageJson = JSON.parse(
			await readFile(fileURLToPath(packageJsonUrl), "utf8"),
		) as PackageJson;

		expect(packageJson.name).toBe("@asdl/areg");
		expect(packageJson.version).toBe(VERSION);
		expect(packageJson.bin).toEqual({ areg: "./src/cli.ts" });
		expect(packageJson.scripts).toMatchObject({
			check: "tsc --noEmit -p tsconfig.json",
			test: "cd ../.. && vitest run --config vitest.config.ts packages/areg/test",
		});
	});
});
