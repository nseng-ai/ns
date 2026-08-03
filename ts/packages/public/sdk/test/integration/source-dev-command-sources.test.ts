import { isAbsolute, resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { loadNsCommandSourceInventory } from "../../src/extensions/source-inventory.ts";

// test/integration -> test -> sdk -> public -> packages -> ts -> checkout root.
const checkoutRoot = resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");

describe("source-dev command source discovery in the ns checkout", () => {
	test("workspace extension packages contribute filesystem command sources", async () => {
		const inventory = await loadNsCommandSourceInventory({ cwd: checkoutRoot });

		expect(
			inventory.diagnostics.filter((diagnostic) =>
				diagnostic.sourceLabel?.startsWith("source-dev:"),
			),
		).toEqual([]);
		for (const packageName of ["@nseng-ai/objectives", "@nseng-ai/reviews", "@nseng-ai/flow"]) {
			const source = inventory.sources.find((candidate) => candidate.package?.name === packageName);
			expect(source, packageName).toMatchObject({
				kind: "preinstalled",
				origin: "package",
				helpClassification: "extension",
			});
			expect(source?.label.startsWith("source-dev:")).toBe(true);
			expect(source?.commandDirectory !== undefined && isAbsolute(source.commandDirectory)).toBe(
				true,
			);
			expect(inventory.extensionPackageNames.has(packageName)).toBe(true);
		}
	});

	test("project-declared packages suppress their source-dev duplicates", async () => {
		const inventory = await loadNsCommandSourceInventory({ cwd: checkoutRoot });

		const skillExposureSources = inventory.sources.filter(
			(source) => source.package?.name === "@nseng-ai/skill-exposure",
		);
		expect(skillExposureSources).toHaveLength(1);
		expect(skillExposureSources[0]).toMatchObject({ kind: "project", origin: "local" });
		expect(new Set(inventory.sources.map(({ label }) => label)).size).toBe(
			inventory.sources.length,
		);
	});
});
