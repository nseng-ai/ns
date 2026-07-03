import { expect, test } from "vitest";

import { createSdlJiti, resolveCommandExportTarget } from "../../src/runtime/module-loader.ts";

function sortedKeys(value: object): string[] {
	return Object.keys(value).sort();
}

test("virtual SDK module mirrors SDK runtime value exports", async () => {
	const sdkModule = await import("@ji/kernel/sdk");
	const virtualModule = await createSdlJiti().import<typeof sdkModule>("@ji/kernel/sdk");
	const sdkKeys = sortedKeys(sdkModule);

	expect(sortedKeys(virtualModule)).toEqual(sdkKeys);
	for (const key of sdkKeys) {
		const sdkKey = key as keyof typeof sdkModule;
		expect(virtualModule[sdkKey]).toBe(sdkModule[sdkKey]);
	}
});

test("command export targets prefer import conditions over default conditions", () => {
	expect(
		resolveCommandExportTarget({
			packageName: "@ji/example",
			subpath: "./commands/run",
			target: { import: "./src/run.ts", default: "./dist/run.js" },
		}),
	).toBe("./src/run.ts");
});

test("command export targets fall back to default conditions", () => {
	expect(
		resolveCommandExportTarget({
			packageName: "@ji/example",
			subpath: "./commands/run",
			target: { default: "./dist/run.js" },
		}),
	).toBe("./dist/run.js");
});

test("invalid command export targets name the package and subpath", () => {
	expect(() =>
		resolveCommandExportTarget({
			packageName: "@ji/example",
			subpath: "./commands/run",
			target: { require: "./dist/run.cjs" },
		}),
	).toThrow(/@ji\/example package\.json export for \.\/commands\/run/);
});
