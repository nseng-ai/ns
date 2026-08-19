import path from "node:path";
import { readdir } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import descriptor from "../../src/ns/ns-extension.ts";

const EXPECTED_ROUTES = [
	"slot/checkout",
	"slot/claim",
	"slot/ff-detached",
	"slot/foreach",
	"slot/free",
	"slot/gc",
	"slot/goto",
	"slot/gt/down",
	"slot/gt/exec/backup-refs",
	"slot/gt/exec/descendants-report",
	"slot/gt/exec/quiescence",
	"slot/gt/exec/restack-preflight",
	"slot/gt/exec/stack-branches",
	"slot/gt/exec/stack-map-branches",
	"slot/gt/free-stack",
	"slot/gt/up",
	"slot/init",
	"slot/list",
	"slot/provision/apply",
	"slot/provision/import",
	"slot/resize",
	"slot/shell/install",
	"slot/shell/show",
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

describe("slots extension descriptor", () => {
	test("owns exactly the canonical slot route subtree", async () => {
		expect(await readdir(descriptor.commandDirectory)).toEqual(["slot"]);
		expect(
			await readdir(
				path.join(descriptor.commandDirectory, (await readdir(descriptor.commandDirectory))[0]!),
			),
		).toContain("group.ts");
		expect(await commandRoutes(descriptor.commandDirectory)).toEqual(EXPECTED_ROUTES);
		expect(path.isAbsolute(descriptor.commandDirectory)).toBe(true);
	});
});
