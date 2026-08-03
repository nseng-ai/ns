import path from "node:path";
import { readdir } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import descriptor from "../../src/ns-extension.ts";
import { EXEC_OPERATIONS } from "../../src/exec-commands.ts";

const EXPECTED_ROUTES = EXEC_OPERATIONS.map((operation) => `address exec ${operation.name}`);

describe("pr-feedback ns extension descriptor", () => {
	test("declares an absolute filesystem command directory", () => {
		expect(descriptor).toEqual({
			description: "Inspect and address GitHub pull request feedback.",
			commandDirectory: path.join(import.meta.dirname, "../../src/ns/cli"),
		});
		expect(path.isAbsolute(descriptor.commandDirectory)).toBe(true);
	});

	test("keeps filesystem exec routes in sync with operation names", async () => {
		const execDirectory = path.join(descriptor.commandDirectory, "address", "exec");
		const routeNames = (await readdir(execDirectory, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory())
			.map((entry) => `address exec ${entry.name}`)
			.sort();

		expect(routeNames).toEqual([...EXPECTED_ROUTES].sort());
	});
});
