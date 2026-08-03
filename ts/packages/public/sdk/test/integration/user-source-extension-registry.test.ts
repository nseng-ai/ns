import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { loadNsCommandSourceInventory } from "../../src/extensions/source-inventory.ts";
import {
	createExtensionRegistryWorkspace,
	writeUserConfig,
	writeWorkspaceFile,
} from "../helpers/extension-workspace.ts";

interface SourceExtensionExpectation {
	readonly directoryName: string;
	readonly packageName: string;
}

const SOURCE_EXTENSIONS = [
	{ directoryName: "branch-context", packageName: "@nseng-ai/branch-context" },
	{ directoryName: "flow", packageName: "@nseng-ai/flow" },
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
			writeUserConfig(
				workspace,
				`supported_harnesses = ["pi"]\nextensions = [${JSON.stringify(packageRoot)}]\n`,
			);

			const inventory = await loadNsCommandSourceInventory({
				cwd: workspace.cwd,
				homeDir: workspace.homeDir,
				env: { NS_HARNESS: "pi" },
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

	test("discovers Skill Exposure only when explicitly declared by the project", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const packageRoot = fileURLToPath(
			new URL("../../../../incubating/extensions/skill-exposure/", import.meta.url),
		);
		writeWorkspaceFile(
			`${workspace.cwd}/ns.toml`,
			`extensions = [${JSON.stringify(packageRoot)}]\n`,
		);

		const inventory = await loadNsCommandSourceInventory({ cwd: workspace.cwd });
		const projectSources = inventory.sources.filter((source) => source.kind === "project");

		expect(inventory.diagnostics).toEqual([]);
		expect([...inventory.extensionPackageNames]).toEqual(["@nseng-ai/skill-exposure"]);
		expect(projectSources).toEqual([
			expect.objectContaining({
				label: "project:@nseng-ai/skill-exposure",
				kind: "project",
				commandDirectory: expect.any(String),
			}),
		]);
	});
});
