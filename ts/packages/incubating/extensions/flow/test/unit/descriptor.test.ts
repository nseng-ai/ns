import path from "node:path";
import { readdir } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import descriptor from "../../src/ns/extension.ts";

const EXPECTED_ROUTES = [
	"flow/autobranch",
	"flow/autoslot",
	"flow/branch-latest-commit",
	"flow/changes",
	"flow/cp",
	"flow/exec/read-graphite-branch-metadata",
	"flow/generate-pr-inventory",
	"flow/land",
	"flow/pull-trunk",
	"flow/push",
	"flow/squash-stack",
	"flow/submit",
];

async function commandRoutes(directory: string, prefix = ""): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const routes: string[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const route = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
		const children = await readdir(path.join(directory, entry.name), { withFileTypes: true });
		if (children.some((child) => child.isFile() && child.name === "command.ts")) routes.push(route);
		routes.push(...(await commandRoutes(path.join(directory, entry.name), route)));
	}
	return routes;
}

describe("flow extension descriptor", () => {
	test("owns exactly the canonical flow route subtree", async () => {
		expect(await readdir(descriptor.commandDirectory)).toEqual(["flow"]);
		expect(
			await readdir(
				path.join(descriptor.commandDirectory, (await readdir(descriptor.commandDirectory))[0]!),
			),
		).toContain("group.ts");
		expect(await commandRoutes(descriptor.commandDirectory)).toEqual(EXPECTED_ROUTES);
		expect(path.isAbsolute(descriptor.commandDirectory)).toBe(true);
	});
});
