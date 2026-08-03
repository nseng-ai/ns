import path from "node:path";
import { readdir } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import descriptor from "../../src/ns-extension.ts";

const EXPECTED_ROUTES = ["apply", "show", "check"];

describe("skill exposure extension descriptor", () => {
	test("declares an absolute filesystem command directory", () => {
		expect(descriptor).toEqual({
			description: "Inspect and reconcile repository skill exposure overlays.",
			commandDirectory: path.join(import.meta.dirname, "../../src/ns/cli"),
		});
		expect(path.isAbsolute(descriptor.commandDirectory)).toBe(true);
	});

	test("keeps the exact route-local command inventory", async () => {
		const groupDirectory = path.join(descriptor.commandDirectory, "skill-exposure");
		const routeNames = (await readdir(groupDirectory, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();

		expect(routeNames).toEqual([...EXPECTED_ROUTES].sort());
		for (const route of routeNames) {
			const loaded = await import(`../../src/ns/cli/skill-exposure/${route}/command.ts`);
			expect(Object.keys(loaded)).toEqual(["command"]);
			await expect(loaded.command()).resolves.toBeDefined();
		}
	});
});
