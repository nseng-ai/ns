import { describe, expect, test } from "vitest";

import {
	parseDescriptorArtifactDeclarations,
	parsePackageManifestArtifactDeclaration,
} from "../src/harness-artifacts/module-artifact-declaration.ts";

function parsePackageJson(value: unknown) {
	return parsePackageManifestArtifactDeclaration(JSON.stringify(value));
}

function parseDescriptorArtifacts(packageJson: unknown, declarations: readonly unknown[]) {
	return parseDescriptorArtifactDeclarations(JSON.stringify(packageJson), declarations);
}

describe("module artifact declaration parser", () => {
	test("parses valid skill declarations into derived npm-module artifact entries", () => {
		const result = parseDescriptorArtifacts(
			{
				name: "@acme/ext",
				version: "1.2.3",
			},
			[
				{
					kind: "skill",
					name: "demo-skill",
					path: "skills/demo-skill",
					description: "Demo skill.",
				},
			],
		);

		expect(result).toMatchObject({ ok: true, packageName: "@acme/ext", version: "1.2.3" });
		if (!result.ok) return;
		expect(result.diagnostics).toEqual([]);
		expect(result.artifacts).toEqual([
			{
				kind: "skill",
				id: "@acme/ext:demo-skill",
				name: "demo-skill",
				description: "Demo skill.",
				skillName: "demo-skill",
				source: {
					type: "npm-module",
					packageName: "@acme/ext",
					relativePath: "skills/demo-skill",
				},
			},
		]);
	});

	test("accepts no declaration as an empty catalog", () => {
		const result = parsePackageJson({ name: "acme-ext", version: "1.0.0" });

		expect(result).toMatchObject({ ok: true, artifacts: [], diagnostics: [] });
	});

	test("falls back to an unversioned package version and deterministic description", () => {
		const result = parseDescriptorArtifacts({ name: "acme-ext" }, [
			{ kind: "skill", name: "demo", path: "skills/demo" },
		]);

		expect(result).toMatchObject({ ok: true, version: "unversioned" });
		if (!result.ok) return;
		expect(result.artifacts[0]?.description).toBe("Skill declared by acme-ext.");
	});

	test("returns a diagnostic for invalid JSON", () => {
		const result = parsePackageManifestArtifactDeclaration("{");

		expect(result).toMatchObject({
			ok: false,
			diagnostics: [{ code: "module_artifact_package_json_invalid" }],
		});
	});

	test("returns a diagnostic for missing or invalid package names", () => {
		const result = parsePackageJson({ version: "1.0.0" });

		expect(result).toMatchObject({
			ok: false,
			diagnostics: [{ code: "module_artifact_package_name_invalid" }],
		});
	});

	test("diagnoses unsupported model-only artifact kinds", () => {
		const result = parseDescriptorArtifacts({ name: "acme-ext" }, [
			{ kind: "agent", name: "bot", path: "agents/bot" },
		]);

		expect(result).toMatchObject({
			ok: true,
			artifacts: [],
			diagnostics: [{ code: "module_artifact_kind_unsupported" }],
		});
	});

	test("continues past invalid items and reports duplicate declaration names", () => {
		const result = parseDescriptorArtifacts({ name: "acme-ext" }, [
			{ kind: "skill", name: "valid", path: "skills/valid" },
			{ kind: "skill", name: "", path: "skills/missing-name" },
			{ kind: "skill", name: "valid", path: "skills/other" },
		]);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.artifacts).toEqual([]);
		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"module_artifact_name_invalid",
			"module_artifact_duplicate_name",
			"module_artifact_duplicate_name",
		]);
	});

	test.each(["/skills/demo", "skills\\demo", "../demo", "skills/../demo", "skills//demo"])(
		"diagnoses invalid relative path %s",
		(path) => {
			const result = parseDescriptorArtifacts({ name: "acme-ext" }, [
				{ kind: "skill", name: "demo", path },
			]);

			expect(result).toMatchObject({
				ok: true,
				artifacts: [],
				diagnostics: [{ code: "module_artifact_path_invalid" }],
			});
		},
	);
});
