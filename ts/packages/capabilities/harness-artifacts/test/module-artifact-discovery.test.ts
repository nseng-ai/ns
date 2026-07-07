import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vitest";

import { discoverExtensionModuleHarnessArtifacts } from "../src/module-artifact-discovery.ts";
import { descriptorExtensionSource, descriptorPackageJson } from "./support/descriptor-fixtures.ts";

describe("descriptor module artifact discovery", () => {
	test("ignores projects without ns.toml extension declarations", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-descriptor-artifacts-empty-"));
		try {
			writeText(join(root, ".ns", "extensions", "direct", "index.ts"), "export default {};\n");

			const result = await discoverExtensionModuleHarnessArtifacts({
				projectRoot: root,
				homeDir: join(root, "home"),
			});

			expect(result).toEqual({ catalogs: [], diagnostics: [] });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("discovers skill artifacts declared by descriptor bundledArtifacts", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-descriptor-artifacts-"));
		try {
			writeDescriptorExtension(root, "descriptor-ext", {
				packageName: "descriptor-ext",
				version: "1.0.0",
				exportTarget: { import: "./src/ns/extension.ts" },
				bundledArtifacts: [
					{
						kind: "skill",
						name: "descriptor-skill",
						path: "skills/descriptor",
						description: "Descriptor skill.",
					},
				],
			});
			writeText(
				join(root, "extensions", "descriptor-ext", "skills", "descriptor", "SKILL.md"),
				"descriptor\n",
			);
			writeText(join(root, "ns.toml"), 'extensions = ["./extensions/descriptor-ext"]\n');

			const result = await discoverExtensionModuleHarnessArtifacts({
				projectRoot: root,
				homeDir: join(root, "home"),
				env: {},
			});

			expect(result.diagnostics).toEqual([]);
			expect(result.catalogs).toHaveLength(1);
			expect(result.catalogs[0]?.packageName).toBe("descriptor-ext");
			expect(result.catalogs[0]?.artifacts).toEqual([
				expect.objectContaining({
					id: "descriptor-ext:descriptor-skill",
					description: "Descriptor skill.",
					source: expect.objectContaining({ relativePath: "skills/descriptor" }),
				}),
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("discovers multiple ns.toml extension descriptors deterministically", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-descriptor-artifacts-many-"));
		try {
			writeDescriptorExtension(root, "project-ext", {
				packageName: "@acme/project-ext",
				version: "2.0.0",
				bundledArtifacts: [{ kind: "skill", name: "project-skill", path: "skills/project" }],
			});
			writeDescriptorExtension(root, "global-ext", {
				packageName: "@acme/global-ext",
				version: "1.0.0",
				bundledArtifacts: [{ kind: "skill", name: "global-skill", path: "skills/global" }],
			});
			writeText(
				join(root, "extensions", "project-ext", "skills", "project", "SKILL.md"),
				"project\n",
			);
			writeText(join(root, "extensions", "global-ext", "skills", "global", "SKILL.md"), "global\n");
			writeText(
				join(root, "ns.toml"),
				'extensions = ["./extensions/project-ext", "./extensions/global-ext"]\n',
			);

			const result = await discoverExtensionModuleHarnessArtifacts({ projectRoot: root });

			expect(result.diagnostics).toEqual([]);
			expect(result.catalogs.map((catalog) => catalog.packageName)).toEqual([
				"@acme/global-ext",
				"@acme/project-ext",
			]);
			expect(
				result.catalogs.flatMap((catalog) => catalog.artifacts.map((artifact) => artifact.id)),
			).toEqual(["@acme/global-ext:global-skill", "@acme/project-ext:project-skill"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("discovers declared local package roots directly", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-descriptor-artifacts-local-"));
		try {
			writeDescriptorExtension(root, "local-ext", {
				packageName: "@acme/local-ext",
				version: "3.0.0",
				bundledArtifacts: [{ kind: "skill", name: "local-skill", path: "skills/local" }],
			});
			writeText(join(root, "extensions", "local-ext", "skills", "local", "SKILL.md"), "local\n");

			const result = await discoverExtensionModuleHarnessArtifacts({
				projectRoot: root,
				localPackageRoots: [join(root, "extensions", "local-ext")],
			});

			expect(result.diagnostics).toEqual([]);
			expect(result.catalogs.map((catalog) => catalog.packageName)).toEqual(["@acme/local-ext"]);
			expect(result.catalogs[0]?.artifacts.map((artifact) => artifact.id)).toEqual([
				"@acme/local-ext:local-skill",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("diagnoses invalid declared local package roots without blocking valid roots", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-descriptor-artifacts-local-diagnostics-"));
		try {
			writeText(join(root, "not-dir"), "file\n");
			mkdirSync(join(root, "no-package"), { recursive: true });
			writeDescriptorExtension(root, "good", {
				packageName: "@acme/good",
				bundledArtifacts: [{ kind: "skill", name: "good-skill", path: "skills/good" }],
			});
			writeText(join(root, "extensions", "good", "skills", "good", "SKILL.md"), "good\n");

			const result = await discoverExtensionModuleHarnessArtifacts({
				projectRoot: root,
				localPackageRoots: [
					join(root, "missing"),
					join(root, "not-dir"),
					join(root, "no-package"),
					join(root, "extensions", "good"),
				],
			});

			expect(result.catalogs.map((catalog) => catalog.packageName)).toEqual(["@acme/good"]);
			expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
				"module_artifact_local_package_missing",
				"module_artifact_local_package_missing_package_json",
				"module_artifact_local_package_not_directory",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("surfaces package parser diagnostics for declared extensions", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-descriptor-artifacts-bad-"));
		try {
			writeText(join(root, "extensions", "bad", "package.json"), "{");
			writeText(join(root, "ns.toml"), 'extensions = ["./extensions/bad"]\n');

			const result = await discoverExtensionModuleHarnessArtifacts({ projectRoot: root });

			expect(result.diagnostics).toMatchObject([
				{
					code: "module_artifact_package_json_invalid",
					path: join(root, "extensions", "bad", "package.json"),
				},
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("diagnoses missing SKILL.md without hiding valid catalog data", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-descriptor-artifacts-diagnostics-"));
		try {
			writeDescriptorExtension(root, "ext", {
				packageName: "acme-ext",
				version: "1.0.0",
				bundledArtifacts: [
					{ kind: "skill", name: "missing", path: "skills/missing" },
					{ kind: "skill", name: "valid", path: "skills/valid" },
				],
			});
			writeText(join(root, "extensions", "ext", "skills", "valid", "SKILL.md"), "valid\n");
			writeText(join(root, "ns.toml"), 'extensions = ["./extensions/ext"]\n');

			const result = await discoverExtensionModuleHarnessArtifacts({ projectRoot: root });

			expect(result.catalogs).toHaveLength(1);
			expect(result.catalogs[0]?.artifacts.map((artifact) => artifact.id)).toEqual([
				"acme-ext:valid",
			]);
			expect(result.catalogs[0]?.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
				"module_artifact_skill_entry_missing",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("diagnoses duplicate ids and target skill names across modules while preserving entries", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-descriptor-artifacts-duplicates-"));
		try {
			writeDescriptorExtension(root, "left", {
				packageName: "acme-left",
				bundledArtifacts: [{ kind: "skill", name: "shared", path: "skills/shared" }],
			});
			writeDescriptorExtension(root, "right", {
				packageName: "acme-right",
				bundledArtifacts: [{ kind: "skill", name: "shared", path: "skills/shared" }],
			});
			writeDescriptorExtension(root, "right-copy", {
				packageName: "acme-right",
				bundledArtifacts: [{ kind: "skill", name: "shared", path: "skills/shared" }],
			});
			for (const extensionName of ["left", "right", "right-copy"] as const) {
				writeText(
					join(root, "extensions", extensionName, "skills", "shared", "SKILL.md"),
					`${extensionName}\n`,
				);
			}
			writeText(
				join(root, "ns.toml"),
				'extensions = ["./extensions/left", "./extensions/right", "./extensions/right-copy"]\n',
			);

			const result = await discoverExtensionModuleHarnessArtifacts({ projectRoot: root });

			expect(result.catalogs.flatMap((catalog) => catalog.artifacts)).toHaveLength(3);
			expect(result.diagnostics.map((diagnostic) => diagnostic.code).sort()).toEqual([
				"module_artifact_duplicate_id",
				"module_artifact_duplicate_id",
				"module_artifact_duplicate_target_name",
				"module_artifact_duplicate_target_name",
				"module_artifact_duplicate_target_name",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

function writeDescriptorExtension(
	root: string,
	extensionName: string,
	options: {
		packageName: string;
		version?: string;
		exportTarget?: unknown;
		bundledArtifacts: readonly unknown[];
	},
): void {
	writeText(
		join(root, "extensions", extensionName, "package.json"),
		descriptorPackageJson({
			name: options.packageName,
			...(options.version === undefined ? {} : { version: options.version }),
			...(options.exportTarget === undefined ? {} : { exportTarget: options.exportTarget }),
		}),
	);
	writeText(
		join(root, "extensions", extensionName, "src", "ns", "extension.ts"),
		descriptorExtensionSource({
			description: `${extensionName}.`,
			bundledArtifacts: options.bundledArtifacts,
		}),
	);
}

function writeText(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text, "utf8");
}
