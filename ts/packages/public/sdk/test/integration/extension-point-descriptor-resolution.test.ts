import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import {
	loadPointCatalogWithDescriptors,
	nodeProjectConfigGateway,
	resolvePromptPointPath,
	resolvePromptPointSource,
} from "../../src/project-config/points.ts";

const roots: string[] = [];

const flowPackagedPromptDefaults = [
	{
		pointId: "flow.submit.pre.recovery",
		defaultPath: "../submit/prompts/submit-check-recovery-default.md",
		promptFileName: "submit-check-recovery-default.md",
	},
	{
		pointId: "flow.submit.pr-description",
		defaultPath: "../submit/prompts/pr-description-default.md",
		promptFileName: "pr-description-default.md",
	},
] as const;

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("extension point descriptor resolution", () => {
	test.each(flowPackagedPromptDefaults)(
		"resolves the checked-in Flow $pointId default relative to its descriptor",
		async ({ pointId, defaultPath, promptFileName }) => {
			const root = await projectRoot();
			const flowPackageRoot = fileURLToPath(
				new URL("../../../../incubating/extensions/flow/", import.meta.url),
			);
			await writeFile(join(root, "ns.toml"), `extensions = [${JSON.stringify(flowPackageRoot)}]\n`);

			const catalog = await loadPointCatalogWithDescriptors({
				repoRoot: root,
				gateway: nodeProjectConfigGateway,
				env: {},
			});
			const manifestPath = join(flowPackageRoot, "src", "ns", "extension.ts");
			const entry = catalog.entries.find((candidate) => candidate.definition.id === pointId);
			expect(entry?.definition).toMatchObject({
				id: pointId,
				accepts: "prompt",
				cardinality: "one",
				defaultPath,
				manifestPath,
			});
			const source = resolvePromptPointSource(catalog, pointId);
			expect(source).toEqual({
				type: "default",
				pointId,
				path: defaultPath,
				manifestPath,
			});
			if (source.type !== "default") {
				throw new Error(`Expected the Flow ${pointId} default source`);
			}
			const resolved = resolvePromptPointPath(root, source);
			expect(resolved).toEqual({
				path: join(flowPackageRoot, "src", "submit", "prompts", promptFileName),
				label: `manifest default ${defaultPath}`,
			});
			if (resolved === undefined)
				throw new Error(`Expected the Flow ${pointId} default to resolve`);
			expect((await readFile(resolved.path, "utf8")).trim()).not.toBe("");
		},
	);

	test("loads npm descriptor points from managed npm storage", async () => {
		const root = await projectRoot();
		await writeDescriptorPackage(
			join(
				root,
				".ns",
				"managed-extensions",
				"npm",
				"@acme",
				"tools",
				"node_modules",
				"@acme",
				"tools",
			),
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

	test("ignores a package present only in the legacy shared npm project", async () => {
		const root = await projectRoot();
		await writeDescriptorPackage(
			join(root, ".ns", "managed-extensions", "npm", "node_modules", "@acme", "tools"),
			"@acme/tools",
			"legacy.point",
		);
		await writeFile(join(root, "ns.toml"), 'extensions = ["npm:@acme/tools"]\n');

		const catalog = await loadPointCatalogWithDescriptors({
			repoRoot: root,
			gateway: nodeProjectConfigGateway,
			env: {},
		});

		expect(catalog.entries.map((entry) => entry.definition.id)).not.toContain("legacy.point");
		const packageJsonPath = join(
			root,
			".ns",
			"managed-extensions",
			"npm",
			"@acme",
			"tools",
			"node_modules",
			"@acme",
			"tools",
			"package.json",
		);
		expect(catalog.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "extension_descriptor_package_json_read_failed",
				message: `Could not read extension package manifest ${packageJsonPath}.\nFile does not exist.`,
				path: packageJsonPath,
			}),
		);
	});

	test("wraps the canonical unsupported-git reason in point diagnostic context", async () => {
		const root = await projectRoot();
		await writeFile(join(root, "ns.toml"), 'extensions = ["git:github/acme/tools@main"]\n');

		const catalog = await loadPointCatalogWithDescriptors({
			repoRoot: root,
			gateway: nodeProjectConfigGateway,
			env: {},
		});

		expect(catalog.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "extension_descriptor_source_unsupported",
				path: "git:github/acme/tools@main",
				message: expect.stringContaining("Git extension sources are recognized but unsupported."),
			}),
		);
	});

	test("loads local descriptor points in place even when legacy storage has the same package", async () => {
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
		`import { defineExtension } from "@nseng-ai/sdk";
export default defineExtension({
  description: "point fixture",
  points: [{ id: ${JSON.stringify(pointId)}, accepts: "hook", cardinality: "many" }],
});
`,
	);
}
