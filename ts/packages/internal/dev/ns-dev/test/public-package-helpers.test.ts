import { describe, expect, it } from "vitest";

import { normalizeBinPaths } from "../src/public-packages/helpers.ts";
import {
	buildPublishManifest,
	repoRoot,
	workspaceRoot,
	type PublicPackageContext,
} from "../src/public-packages/package-set.ts";

describe("public package helpers", () => {
	it("resolves the workspace and repository roots from typed module ownership", () => {
		expect(workspaceRoot).toMatch(/\/ts$/u);
		expect(repoRoot).not.toMatch(/\/ts$/u);
	});

	it("keeps only string bin targets and strips leading current-directory markers", () => {
		expect(normalizeBinPaths({ ns: "./src/cli.ts", malformed: 42, absent: null })).toEqual({
			ns: "src/cli.ts",
		});
	});

	it("retains Pi package metadata in publish manifests", () => {
		const context: PublicPackageContext = {
			workspaceManifest: { engines: { node: ">=24" } },
			workspaceYaml: "catalog:\n  zod: ^4.4.3\n",
			packageManifests: [],
			manifestByName: new Map(),
			releaseInventory: ["@nseng-ai/example"],
		};

		expect(
			buildPublishManifest(
				{
					name: "@nseng-ai/example",
					version: "1.2.3",
					keywords: ["pi-package"],
					pi: { extensions: ["./src/extension.ts"] },
					dependencies: { zod: "catalog:" },
				},
				context,
			),
		).toMatchObject({
			keywords: ["pi-package"],
			pi: { extensions: ["./src/extension.ts"] },
			dependencies: { zod: "^4.4.3" },
		});
	});
});
