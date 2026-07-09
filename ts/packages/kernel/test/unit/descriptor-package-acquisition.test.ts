import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	descriptorExportTarget,
	managedDescriptorPackageRoot,
	nsExtensionExportTarget,
	resolveAcquiredDescriptorPackageRoot,
} from "@nseng-ai/kernel/project-config";
import { appendDeclaredExtensionSpecToml } from "../../src/project-config/ns-toml-extensions-edit.ts";

describe("ns.toml extension spec edits", () => {
	test("creates extensions array without reserializing the document", () => {
		expect(appendDeclaredExtensionSpecToml('harnesses = ["pi"]\n', "./extensions/tools")).toEqual({
			ok: true,
			text: 'harnesses = ["pi"]\nextensions = ["./extensions/tools"]\n',
			isAdded: true,
		});
	});

	test("appends idempotently to an existing extensions array", () => {
		const first = appendDeclaredExtensionSpecToml(
			'extensions = ["./extensions/a"]\n[points]\n',
			"./extensions/b",
		);
		expect(first).toEqual({
			ok: true,
			text: 'extensions = ["./extensions/a", "./extensions/b"]\n[points]\n',
			isAdded: true,
		});
		expect(appendDeclaredExtensionSpecToml(first.ok ? first.text : "", "./extensions/b")).toEqual({
			ok: true,
			text: 'extensions = ["./extensions/a", "./extensions/b"]\n[points]\n',
			isAdded: false,
		});
	});

	test("reports invalid ns.toml before editing", () => {
		expect(appendDeclaredExtensionSpecToml("extensions = [\n", "./extensions/a")).toMatchObject({
			ok: false,
			reason: "invalid-toml",
		});
	});
});

describe("descriptor package exports", () => {
	test("resolves string and conditional descriptor export targets", () => {
		expect(nsExtensionExportTarget({ "./ns-extension": "./src/ns/extension.ts" })).toBe(
			"./src/ns/extension.ts",
		);
		expect(
			nsExtensionExportTarget({
				"./ns-extension": {
					import: "./src/ns/extension.ts",
					default: "./dist/ns/extension.js",
				},
			}),
		).toBe("./src/ns/extension.ts");
		expect(
			nsExtensionExportTarget({
				"./ns-extension": { default: "./dist/ns/extension.js" },
			}),
		).toBe("./dist/ns/extension.js");
		expect(nsExtensionExportTarget({ "./other": "./src/ns/extension.ts" })).toBeUndefined();
	});

	test("resolves descriptor export targets from package manifests", () => {
		expect(
			descriptorExportTarget({
				exports: { "./ns-extension": { default: "./src/ns/extension.ts" } },
			}),
		).toBe("./src/ns/extension.ts");
	});
});

describe("descriptor package acquisition", () => {
	test("uses the managed package root when a declared local spec has been installed", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "ns-acquisition-"));
		const sourceRoot = join(repoRoot, "extensions", "tools");
		writePackageJson(sourceRoot, "@acme/tools");
		const managedRoot = managedDescriptorPackageRoot(repoRoot, "@acme/tools");
		writePackageJson(managedRoot, "@acme/tools");

		expect(resolveAcquiredDescriptorPackageRoot({ repoRoot, spec: "./extensions/tools" })).toEqual({
			packageRoot: managedRoot,
		});
	});

	test("keeps direct path resolution when the managed package is absent", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "ns-acquisition-"));
		const sourceRoot = join(repoRoot, "extensions", "tools");
		writePackageJson(sourceRoot, "tools");

		expect(resolveAcquiredDescriptorPackageRoot({ repoRoot, spec: "./extensions/tools" })).toEqual({
			packageRoot: sourceRoot,
		});
	});
});

function writePackageJson(root: string, name: string): void {
	mkdirSync(root, { recursive: true });
	writeFileSync(join(root, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
}
