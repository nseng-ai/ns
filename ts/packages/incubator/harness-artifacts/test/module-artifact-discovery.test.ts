import { describe, expect, test } from "vitest";

import { defineExtension } from "@nseng-ai/sdk";

import { discoverDeclaredExtensionModuleHarnessArtifacts } from "../src/module-artifact-discovery.ts";
import { InMemoryHarnessFs } from "./support/in-memory-harness-fs.ts";

function declaredModule(options: {
	root: string;
	packageName: string;
	artifactId: string;
	skillName: string;
	relativePath?: string;
}) {
	return {
		moduleRoot: options.root,
		packageName: options.packageName,
		version: "1.0.0",
		descriptor: defineExtension({
			description: options.packageName,
			bundledArtifacts: [
				{
					kind: "skill",
					name: options.skillName,
					path: options.relativePath ?? "skills/demo",
				},
			],
		}),
	};
}

describe("declared module artifact discovery", () => {
	test("translates already-loaded descriptors and validates artifact files", async () => {
		const fs = new InMemoryHarnessFs({ "/extensions/demo/skills/demo/SKILL.md": "# Demo\n" });
		const result = await discoverDeclaredExtensionModuleHarnessArtifacts({
			modules: [
				declaredModule({
					root: "/extensions/demo",
					packageName: "@acme/demo",
					artifactId: "@acme/demo:demo",
					skillName: "demo",
				}),
			],
			gateway: fs,
		});

		expect(result.diagnostics).toEqual([]);
		expect(result.catalogs[0]?.artifacts).toMatchObject([
			{ id: "@acme/demo:demo", skillName: "demo" },
		]);
	});

	test("rejects escaping and missing artifact paths without loading descriptors", async () => {
		const fs = new InMemoryHarnessFs({});
		const result = await discoverDeclaredExtensionModuleHarnessArtifacts({
			modules: [
				declaredModule({
					root: "/extensions/escape",
					packageName: "@acme/escape",
					artifactId: "@acme/escape:demo",
					skillName: "escape",
					relativePath: "../outside",
				}),
				declaredModule({
					root: "/extensions/missing",
					packageName: "@acme/missing",
					artifactId: "@acme/missing:demo",
					skillName: "missing",
				}),
			],
			gateway: fs,
		});

		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"module_artifact_path_invalid",
			"module_artifact_skill_entry_missing",
		]);
	});

	test("reports duplicate ids and target names across validated descriptors", async () => {
		const fs = new InMemoryHarnessFs({
			"/extensions/a/skills/demo/SKILL.md": "# A\n",
			"/extensions/b/skills/demo/SKILL.md": "# B\n",
		});
		const result = await discoverDeclaredExtensionModuleHarnessArtifacts({
			modules: [
				declaredModule({
					root: "/extensions/a",
					packageName: "@acme/a",
					artifactId: "shared",
					skillName: "shared",
				}),
				declaredModule({
					root: "/extensions/b",
					packageName: "@acme/b",
					artifactId: "shared",
					skillName: "shared",
				}),
			],
			gateway: fs,
		});

		expect(
			result.diagnostics.filter((diagnostic) => diagnostic.code.includes("duplicate")),
		).toHaveLength(2);
	});
});
