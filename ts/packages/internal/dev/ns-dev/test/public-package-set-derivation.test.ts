import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
	deriveReleaseInventory,
	isReleaseCandidate,
	loadPublicPackageContext,
	publicDispositionRoot,
	workspaceRoot,
	type PackageManifest,
	type PublicPackageEntry,
} from "../src/public-packages/package-set.ts";
import { sdkFoldEntries, sdkPublicExports } from "../src/public-packages/sdk-public-subpaths.ts";
import { FakeFileSystemGateway } from "./scenario/run-scenario.ts";

function entry(relativePath: string, manifest: Omit<PackageManifest, "name"> & { name: string }) {
	const path = resolve(workspaceRoot, "packages", relativePath, "package.json");
	return { path, root: dirname(path), manifest } satisfies PublicPackageEntry;
}

function workspaceFiles(
	manifests: Record<string, Record<string, unknown>>,
): Record<string, string> {
	const files: Record<string, string> = {
		[resolve(workspaceRoot, "package.json")]: JSON.stringify({ engines: { node: ">=24" } }),
		[resolve(workspaceRoot, "pnpm-workspace.yaml")]: "catalog:\n  '@types/node': 24.0.0\n",
	};
	for (const [relativePath, manifest] of Object.entries(manifests)) {
		files[resolve(workspaceRoot, "packages", relativePath, "package.json")] =
			JSON.stringify(manifest);
	}
	return files;
}

/** The minimum manifests `loadPublicPackageContext` needs before it will look at anything else. */
function sdkFoldManifests(version: string): Record<string, Record<string, unknown>> {
	return {
		"public/sdk": { name: "@nseng-ai/sdk", version, exports: sdkPublicExports() },
		"public/ns": {
			name: "@nseng-ai/ns",
			version,
			exports: Object.fromEntries(
				sdkFoldEntries.map((fold) => [fold.nsExport, `./src/sdk/${fold.name}.ts`]),
			),
		},
	};
}

describe("release candidate qualification", () => {
	it("qualifies exactly the non-private manifests under the public disposition root", () => {
		expect(publicDispositionRoot).toBe(resolve(workspaceRoot, "packages", "public"));
		expect(isReleaseCandidate(entry("public/infra/clinkr", { name: "@nseng-ai/clinkr" }))).toBe(
			true,
		);
		expect(
			isReleaseCandidate(entry("public/tools/hidden", { name: "@nseng-ai/hidden", private: true })),
		).toBe(false);
		expect(
			isReleaseCandidate(entry("incubating/extensions/flow", { name: "@nseng-ai/flow" })),
		).toBe(false);
		expect(isReleaseCandidate(entry("internal/dev/ns-dev", { name: "@internal/ns-dev" }))).toBe(
			false,
		);
		// A sibling directory whose name merely starts with "public" is outside the root.
		expect(isReleaseCandidate(entry("public-preview/thing", { name: "@nseng-ai/preview" }))).toBe(
			false,
		);
	});
});

describe("release inventory derivation", () => {
	it("derives membership from the tree, so a new public package needs no second edit", () => {
		const before = [
			entry("public/infra/clinkr", { name: "@nseng-ai/clinkr" }),
			entry("incubating/tools/vibechk", { name: "@nseng-ai/vibechk" }),
		];
		expect(deriveReleaseInventory(before)).toEqual(["@nseng-ai/clinkr"]);

		const afterMovingOneMore = [
			...before,
			entry("public/tools/packagechk", {
				name: "@nseng-ai/packagechk",
				dependencies: { "@nseng-ai/clinkr": "workspace:*" },
			}),
		];
		expect(deriveReleaseInventory(afterMovingOneMore)).toEqual([
			"@nseng-ai/clinkr",
			"@nseng-ai/packagechk",
		]);
	});

	it("never treats a private public-root package or a non-public package as a candidate", () => {
		expect(
			deriveReleaseInventory([
				entry("public/infra/clinkr", { name: "@nseng-ai/clinkr" }),
				entry("public/tools/embargoed", { name: "@nseng-ai/embargoed", private: true }),
				entry("incubating/hosts/pi/runtime/pi-runtime", { name: "@nseng-ai/pi-runtime" }),
				entry("internal/hosts/pi/tools/pi-editor-mods", { name: "@internal/pi-editor-mods" }),
			]),
		).toEqual(["@nseng-ai/clinkr"]);
	});

	it("orders candidates after every candidate they depend on, breaking ties alphabetically", () => {
		const inventory = deriveReleaseInventory([
			entry("public/ns", {
				name: "@nseng-ai/ns",
				dependencies: {
					"@nseng-ai/clinkr": "workspace:*",
					"@nseng-ai/extension-kit": "workspace:*",
					"@nseng-ai/foundation": "workspace:*",
				},
			}),
			entry("public/extension-kit", {
				name: "@nseng-ai/extension-kit",
				dependencies: { "@nseng-ai/foundation": "workspace:*" },
				peerDependencies: { "@nseng-ai/sdk": "workspace:*" },
			}),
			entry("public/sdk", {
				name: "@nseng-ai/sdk",
				dependencies: { "@nseng-ai/foundation": "workspace:*", zod: "catalog:" },
			}),
			entry("public/infra/foundation", {
				name: "@nseng-ai/foundation",
				dependencies: { "@nseng-ai/clinkr": "workspace:*" },
			}),
			entry("public/infra/clinkr", { name: "@nseng-ai/clinkr" }),
			entry("public/infra/brmem", {
				name: "@nseng-ai/brmem",
				dependencies: { "@nseng-ai/foundation": "workspace:*" },
			}),
		]);

		expect(inventory).toEqual([
			"@nseng-ai/clinkr",
			"@nseng-ai/foundation",
			"@nseng-ai/brmem",
			"@nseng-ai/sdk",
			"@nseng-ai/extension-kit",
			"@nseng-ai/ns",
		]);
		for (const [name, dependency] of [
			["@nseng-ai/foundation", "@nseng-ai/clinkr"],
			["@nseng-ai/extension-kit", "@nseng-ai/sdk"],
			["@nseng-ai/ns", "@nseng-ai/extension-kit"],
		] as const) {
			expect(inventory.indexOf(dependency)).toBeLessThan(inventory.indexOf(name));
		}
	});

	it("refuses a cyclic candidate dependency graph instead of inventing an order", () => {
		expect(() =>
			deriveReleaseInventory([
				entry("public/a", { name: "@nseng-ai/a", dependencies: { "@nseng-ai/b": "workspace:*" } }),
				entry("public/b", { name: "@nseng-ai/b", dependencies: { "@nseng-ai/a": "workspace:*" } }),
			]),
		).toThrow(/cyclic/u);
	});
});

describe("public package context loading", () => {
	it("walks the workspace and exposes only derived public candidates", async () => {
		const fs = new FakeFileSystemGateway({
			cwd: workspaceRoot,
			files: workspaceFiles({
				...sdkFoldManifests("1.2.3"),
				"public/infra/clinkr": { name: "@nseng-ai/clinkr", version: "1.2.3" },
				"public/tools/embargoed": {
					name: "@nseng-ai/embargoed",
					version: "1.2.3",
					private: true,
				},
				"incubating/extensions/flow": { name: "@nseng-ai/flow", version: "1.2.3" },
				"internal/dev/ns-dev": { name: "@internal/ns-dev", version: "1.2.3", private: true },
			}),
		});

		const context = await loadPublicPackageContext(fs);

		expect(context.releaseInventory).toEqual(["@nseng-ai/clinkr", "@nseng-ai/ns", "@nseng-ai/sdk"]);
		expect(context.manifestByName.has("@nseng-ai/flow")).toBe(true);
		expect(context.releaseInventory).not.toContain("@nseng-ai/flow");
		expect(context.releaseInventory).not.toContain("@nseng-ai/embargoed");
	});

	it("refuses a public candidate without a version", async () => {
		const fs = new FakeFileSystemGateway({
			cwd: workspaceRoot,
			files: workspaceFiles({
				...sdkFoldManifests("1.2.3"),
				"public/infra/clinkr": { name: "@nseng-ai/clinkr" },
			}),
		});

		await expect(loadPublicPackageContext(fs)).rejects.toThrow(
			"Release candidate has no version: @nseng-ai/clinkr",
		);
	});

	it("refuses an empty public disposition root rather than releasing nothing", async () => {
		const fs = new FakeFileSystemGateway({
			cwd: workspaceRoot,
			files: workspaceFiles({
				"incubating/extensions/flow": { name: "@nseng-ai/flow", version: "1.2.3" },
			}),
		});

		await expect(loadPublicPackageContext(fs)).rejects.toThrow("No release candidates were found");
	});
});
