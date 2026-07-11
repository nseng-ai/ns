import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	loadDeclaredExtensionDescriptors,
	type DeclaredDescriptorFileResult,
	type DeclaredDescriptorImportResult,
	type DeclaredDescriptorPackageManifestResult,
	type DeclaredExtensionDescriptorGateway,
} from "@nseng-ai/kernel/extensions/declared-descriptors";

interface FakeDescriptorPackage {
	readonly root: string;
	readonly manifest?: unknown;
	readonly manifestError?: string;
	readonly hasDescriptorFile?: boolean;
	readonly descriptorExport?: unknown;
	readonly importError?: string;
}

class FakeDeclaredExtensionDescriptorGateway implements DeclaredExtensionDescriptorGateway {
	readonly #packages: ReadonlyMap<string, FakeDescriptorPackage>;

	constructor(packages: readonly FakeDescriptorPackage[]) {
		this.#packages = new Map(
			packages.map((descriptorPackage) => [descriptorPackage.root, descriptorPackage]),
		);
	}

	async readPackageManifest(
		packageJsonPath: string,
	): Promise<DeclaredDescriptorPackageManifestResult> {
		const descriptorPackage = this.#packages.get(packageJsonPath.slice(0, -"/package.json".length));
		if (descriptorPackage === undefined) return { type: "missing" };
		if (descriptorPackage.manifestError !== undefined) {
			return { type: "error", message: descriptorPackage.manifestError };
		}
		return {
			type: "found",
			text: JSON.stringify(
				descriptorPackage.manifest ?? {
					name: `fixture-${descriptorPackage.root.split("/").at(-1) ?? "extension"}`,
					version: "1.0.0",
					exports: { "./ns-extension": "./ns-extension.ts" },
				},
			),
		};
	}

	async inspectDescriptorFile(descriptorPath: string): Promise<DeclaredDescriptorFileResult> {
		const descriptorPackage = this.packageForDescriptorPath(descriptorPath);
		return descriptorPackage?.hasDescriptorFile === false ? { type: "missing" } : { type: "found" };
	}

	async importDescriptorDefault(descriptorPath: string): Promise<DeclaredDescriptorImportResult> {
		const descriptorPackage = this.packageForDescriptorPath(descriptorPath);
		if (descriptorPackage?.importError !== undefined) {
			return { ok: false, message: descriptorPackage.importError };
		}
		return {
			ok: true,
			defaultExport: descriptorPackage?.descriptorExport ?? {
				description: `Descriptor at ${descriptorPath}`,
			},
		};
	}

	private packageForDescriptorPath(descriptorPath: string): FakeDescriptorPackage | undefined {
		return [...this.#packages.values()].find((descriptorPackage) =>
			descriptorPath.startsWith(`${descriptorPackage.root}/`),
		);
	}
}

function localPackage(
	repoRoot: string,
	relativePath: string,
	options: Omit<FakeDescriptorPackage, "root"> = {},
): FakeDescriptorPackage {
	return { root: join(repoRoot, relativePath), ...options };
}

function managedNpmPackage(
	repoRoot: string,
	packageName: string,
	options: Omit<FakeDescriptorPackage, "root"> = {},
): FakeDescriptorPackage {
	return {
		root: join(
			repoRoot,
			".ns",
			"managed-extensions",
			"npm",
			packageName,
			"node_modules",
			packageName,
		),
		...options,
	};
}

describe("declared extension descriptors", () => {
	test("returns an empty result for no declared specs", async () => {
		const result = await loadDeclaredExtensionDescriptors({
			repoRoot: "/repo",
			specs: [],
			gateway: new FakeDeclaredExtensionDescriptorGateway([]),
		});

		expect(result).toEqual({ descriptors: [], diagnostics: [] });
	});

	test("loads local specs directly in declaration order", async () => {
		const repoRoot = "/repo";
		const gateway = new FakeDeclaredExtensionDescriptorGateway([
			localPackage(repoRoot, "extensions/second", {
				descriptorExport: { description: "Second" },
			}),
			localPackage(repoRoot, "extensions/first", {
				descriptorExport: { description: "First" },
			}),
		]);

		const result = await loadDeclaredExtensionDescriptors({
			repoRoot,
			specs: ["./extensions/first", "./extensions/second"],
			gateway,
		});

		expect(result.diagnostics).toEqual([]);
		expect(
			result.descriptors.map(
				({ spec, sourceKind, moduleRoot, packageName, version, descriptor }) => ({
					spec,
					sourceKind,
					moduleRoot,
					packageName,
					version,
					description: descriptor.description,
				}),
			),
		).toEqual([
			{
				spec: "./extensions/first",
				sourceKind: "local",
				moduleRoot: "/repo/extensions/first",
				packageName: "fixture-first",
				version: "1.0.0",
				description: "First",
			},
			{
				spec: "./extensions/second",
				sourceKind: "local",
				moduleRoot: "/repo/extensions/second",
				packageName: "fixture-second",
				version: "1.0.0",
				description: "Second",
			},
		]);
	});

	test("loads npm specs only from their managed installed roots", async () => {
		const repoRoot = "/repo";
		const gateway = new FakeDeclaredExtensionDescriptorGateway([
			managedNpmPackage(repoRoot, "@acme/tools", {
				manifest: {
					name: "@acme/tools",
					version: "1.2.3",
					exports: { "./ns-extension": "./ns-extension.ts" },
				},
				descriptorExport: { description: "Managed tools" },
			}),
		]);

		const result = await loadDeclaredExtensionDescriptors({
			repoRoot,
			specs: ["npm:@acme/tools@1.2.3", "npm:missing"],
			gateway,
		});

		expect(result.descriptors).toMatchObject([
			{
				spec: "npm:@acme/tools@1.2.3",
				sourceKind: "npm",
				moduleRoot: "/repo/.ns/managed-extensions/npm/@acme/tools/node_modules/@acme/tools",
				packageName: "@acme/tools",
				version: "1.2.3",
				descriptor: { description: "Managed tools" },
			},
		]);
		expect(result.diagnostics).toEqual([
			{
				severity: "error",
				code: "extension_descriptor_package_missing",
				message:
					"Declared extension package is not installed: /repo/.ns/managed-extensions/npm/missing/node_modules/missing.",
				spec: "npm:missing",
				path: "/repo/.ns/managed-extensions/npm/missing/node_modules/missing/package.json",
			},
		]);
	});

	test("wraps the canonical unsupported-git reason in declared-descriptor context", async () => {
		const result = await loadDeclaredExtensionDescriptors({
			repoRoot: "/repo",
			specs: ["git:github/acme/tools@main"],
			gateway: new FakeDeclaredExtensionDescriptorGateway([]),
		});

		expect(result.descriptors).toEqual([]);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({
				code: "extension_descriptor_source_unsupported",
				spec: "git:github/acme/tools@main",
				message: expect.stringContaining("Git extension sources are recognized but unsupported."),
			}),
		]);
	});

	test("reports each canonical duplicate identity once and excludes every duplicate declaration", async () => {
		const repoRoot = "/repo";
		const gateway = new FakeDeclaredExtensionDescriptorGateway([
			localPackage(repoRoot, "extensions/first", {
				descriptorExport: { description: "First" },
			}),
			localPackage(repoRoot, "extensions/duplicate", {
				descriptorExport: { description: "Must not load" },
			}),
			localPackage(repoRoot, "extensions/last", {
				descriptorExport: { description: "Last" },
			}),
			managedNpmPackage(repoRoot, "@acme/tools", {
				manifest: {
					name: "@acme/tools",
					version: "1.2.3",
					exports: { "./ns-extension": "./ns-extension.ts" },
				},
				descriptorExport: { description: "Must not load" },
			}),
		]);

		const result = await loadDeclaredExtensionDescriptors({
			repoRoot,
			specs: [
				"./extensions/first",
				"npm:@acme/tools",
				"./extensions/missing",
				"./extensions/duplicate",
				"npm:@acme/tools@1.2.3",
				"npm:@acme/tools@2.0.0",
				"extensions/./duplicate",
				"/repo/extensions/duplicate",
				"./extensions/last",
			],
			gateway,
		});

		expect(result.descriptors.map(({ spec }) => spec)).toEqual([
			"./extensions/first",
			"./extensions/last",
		]);
		expect(result.diagnostics).toMatchObject([
			{
				code: "extension_descriptor_duplicate_identity",
				spec: "npm:@acme/tools",
				relatedSpecs: ["npm:@acme/tools@1.2.3", "npm:@acme/tools@2.0.0"],
			},
			{
				code: "extension_descriptor_package_missing",
				spec: "./extensions/missing",
			},
			{
				code: "extension_descriptor_duplicate_identity",
				spec: "./extensions/duplicate",
				relatedSpecs: ["extensions/./duplicate", "/repo/extensions/duplicate"],
			},
		]);
	});

	test("rejects managed npm identity and pinned-version mismatches before import", async () => {
		const repoRoot = "/repo";
		const gateway = new FakeDeclaredExtensionDescriptorGateway([
			managedNpmPackage(repoRoot, "@acme/wrong-name", {
				manifest: {
					name: "@other/package",
					version: "1.0.0",
					exports: { "./ns-extension": "./ns-extension.ts" },
				},
			}),
			managedNpmPackage(repoRoot, "@acme/wrong-version", {
				manifest: {
					name: "@acme/wrong-version",
					version: "2.0.0",
					exports: { "./ns-extension": "./ns-extension.ts" },
				},
			}),
		]);

		const result = await loadDeclaredExtensionDescriptors({
			repoRoot,
			specs: ["npm:@acme/wrong-name", "npm:@acme/wrong-version@1.0.0"],
			gateway,
		});

		expect(result.descriptors).toEqual([]);
		expect(result.diagnostics.map(({ code }) => code)).toEqual([
			"extension_descriptor_package_identity_mismatch",
			"extension_descriptor_package_version_mismatch",
		]);
	});

	test("aggregates missing, export, import, and validation failures while retaining successes", async () => {
		const repoRoot = "/repo";
		const gateway = new FakeDeclaredExtensionDescriptorGateway([
			localPackage(repoRoot, "extensions/no-export", {
				manifest: { name: "no-export", version: "1.0.0" },
			}),
			localPackage(repoRoot, "extensions/import-failure", { importError: "module exploded" }),
			localPackage(repoRoot, "extensions/invalid", { descriptorExport: { entries: [] } }),
			localPackage(repoRoot, "extensions/good", { descriptorExport: { description: "Good" } }),
		]);

		const result = await loadDeclaredExtensionDescriptors({
			repoRoot,
			specs: [
				"./extensions/missing",
				"./extensions/no-export",
				"./extensions/import-failure",
				"./extensions/invalid",
				"./extensions/good",
			],
			gateway,
		});

		expect(result.descriptors).toMatchObject([
			{ spec: "./extensions/good", descriptor: { description: "Good" } },
		]);
		expect(result.diagnostics.map(({ code, spec }) => ({ code, spec }))).toEqual([
			{
				code: "extension_descriptor_package_missing",
				spec: "./extensions/missing",
			},
			{
				code: "extension_descriptor_export_missing",
				spec: "./extensions/no-export",
			},
			{
				code: "extension_descriptor_import_failed",
				spec: "./extensions/import-failure",
			},
			{
				code: "extension_descriptor_invalid",
				spec: "./extensions/invalid",
			},
		]);
	});
});
