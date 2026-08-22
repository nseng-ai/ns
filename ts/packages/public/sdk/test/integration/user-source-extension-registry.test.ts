import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { loadNsCommandSourceInventory } from "../../src/extensions/source-inventory.ts";
import {
	createExtensionRegistryWorkspace,
	writeUserConfig,
} from "../helpers/extension-workspace.ts";

interface SourceExtensionExpectation {
	readonly directoryName: string;
	readonly packageName: string;
}

const SOURCE_EXTENSIONS = [
	{ directoryName: "branch-context", packageName: "@nseng-ai/branch-context" },
	{ directoryName: "flow", packageName: "@nseng-ai/flow" },
	{ directoryName: "gs", packageName: "@nseng-ai/gs" },
	{ directoryName: "handoffs", packageName: "@nseng-ai/handoffs" },
	{ directoryName: "herdr", packageName: "@nseng-ai/herdr" },
	{ directoryName: "objectives", packageName: "@nseng-ai/objectives" },
	{ directoryName: "pr-feedback", packageName: "@nseng-ai/pr-feedback" },
	{ directoryName: "reviews", packageName: "@nseng-ai/reviews" },
	{ directoryName: "slots", packageName: "@nseng-ai/slots" },
] as const satisfies readonly SourceExtensionExpectation[];

describe("user source extension inventory", () => {
	test.each(SOURCE_EXTENSIONS)(
		"discovers $packageName as one exact filesystem command source",
		async ({ directoryName, packageName }) => {
			const workspace = await createExtensionRegistryWorkspace();
			const packageRoot = fileURLToPath(
				new URL(`../../../../incubating/extensions/${directoryName}/`, import.meta.url),
			);
			writeUserConfig(workspace, `extensions = [${JSON.stringify(packageRoot)}]\n`);

			const inventory = await loadNsCommandSourceInventory({
				cwd: workspace.cwd,
				homeDir: workspace.homeDir,
			});
			const userSources = inventory.sources.filter((source) => source.kind === "user");

			expect(inventory.diagnostics).toEqual([]);
			expect([...inventory.extensionPackageNames]).toEqual([packageName]);
			expect(userSources).toEqual([
				expect.objectContaining({
					label: `user:${packageName}`,
					kind: "user",
					package: expect.objectContaining({ name: packageName }),
					commandDirectory: expect.any(String),
				}),
			]);
			expect(userSources[0]).not.toHaveProperty("compose");
		},
	);
});
