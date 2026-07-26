import { describe, expect, test } from "vitest";
import descriptor from "../../src/ns-extension.ts";

describe("skill exposure extension descriptor", () => {
	test("has the exact group and command entries", () => {
		expect(descriptor.group).toBe("skill-exposure");
		expect(descriptor.entries.map((entry) => entry.name)).toEqual(["apply", "show", "check"]);
	});

	test("lazy-loads every command", async () => {
		for (const entry of descriptor.entries) {
			const loaded = await entry.load();
			expect(loaded.default.name).toBe(entry.name);
			expect(loaded.default.nsParsedCommandSpec).toBeDefined();
		}
	});
});
