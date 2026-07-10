import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
	loadPointCatalogWithDescriptors,
	nodeProjectConfigGateway,
} from "../../src/project-config/points.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("extension point descriptor resolution", () => {
	test("loads npm descriptor points from managed npm storage", async () => {
		const root = await projectRoot();
		await writeDescriptorPackage(
			join(root, ".ns", "managed-extensions", "npm", "node_modules", "@acme", "tools"),
			"@acme/tools",
			"managed.point",
		);
		await writeFile(join(root, "ns.toml"), 'extensions = ["npm:@acme/tools"]\n');

		const catalog = await loadPointCatalogWithDescriptors({
			repoRoot: root,
			gateway: nodeProjectConfigGateway,
			env: {},
		});

		expect(catalog.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
		expect(catalog.entries.map((entry) => entry.definition.id)).toContain("managed.point");
	});

	test("loads local descriptor points in place even when managed storage has the same package", async () => {
		const root = await projectRoot();
		await writeDescriptorPackage(join(root, "extensions", "tools"), "@acme/tools", "local.point");
		await writeDescriptorPackage(
			join(root, ".ns", "managed-extensions", "npm", "node_modules", "@acme", "tools"),
			"@acme/tools",
			"stale.managed.point",
		);
		await writeFile(join(root, "ns.toml"), 'extensions = ["./extensions/tools"]\n');

		const catalog = await loadPointCatalogWithDescriptors({
			repoRoot: root,
			gateway: nodeProjectConfigGateway,
			env: {},
		});

		expect(catalog.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
		expect(catalog.entries.map((entry) => entry.definition.id)).toContain("local.point");
		expect(catalog.entries.map((entry) => entry.definition.id)).not.toContain(
			"stale.managed.point",
		);
	});
});

async function projectRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "ns-extension-points-resolution-"));
	roots.push(root);
	return root;
}

async function writeDescriptorPackage(
	packageRoot: string,
	packageName: string,
	pointId: string,
): Promise<void> {
	const descriptorPath = join(packageRoot, "src", "ns-extension.ts");
	await mkdir(dirname(descriptorPath), { recursive: true });
	await writeFile(
		join(packageRoot, "package.json"),
		JSON.stringify({
			name: packageName,
			version: "1.0.0",
			exports: { "./ns-extension": "./src/ns-extension.ts" },
		}),
	);
	await writeFile(
		descriptorPath,
		`import { defineExtension } from "@nseng-ai/kernel/sdk";
export default defineExtension({
  description: "point fixture",
  points: [{ id: ${JSON.stringify(pointId)}, accepts: "hook", cardinality: "many" }],
});
`,
	);
}
