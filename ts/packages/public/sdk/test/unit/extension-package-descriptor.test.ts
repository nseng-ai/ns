import { describe, expect, test } from "vitest";

import {
	loadExtensionDescriptorFromPackageRoot,
	presentExtensionDescriptorPackageError,
	type ExtensionDescriptorPackageError,
	type ExtensionDescriptorPackageGateway,
} from "../../src/project-config/extension-package-descriptor.ts";

function gateway(options: {
	manifest?: unknown;
	descriptorFile?: "found" | "missing";
	defaultExport?: unknown;
}): ExtensionDescriptorPackageGateway {
	return {
		async readPackageManifest() {
			return {
				type: "found",
				text: JSON.stringify(
					options.manifest ?? {
						name: "@acme/tools",
						version: "1.2.3",
						exports: { "./ns-extension": "./src/ns-extension.ts" },
					},
				),
			};
		},
		async inspectDescriptorFile() {
			return { type: options.descriptorFile ?? "found" };
		},
		async importDescriptorDefault() {
			return {
				ok: true,
				defaultExport: options.defaultExport ?? { description: "Tools" },
			};
		},
	};
}

describe("extension package descriptor loading", () => {
	test("owns manifest, export, import, and descriptor validation for a package root", async () => {
		const result = await loadExtensionDescriptorFromPackageRoot({
			packageRoot: "/repo/extensions/tools",
			gateway: gateway({}),
		});

		expect(result).toEqual({
			ok: true,
			value: expect.objectContaining({
				packageRoot: "/repo/extensions/tools",
				packageJsonPath: "/repo/extensions/tools/package.json",
				packageName: "@acme/tools",
				version: "1.2.3",
				descriptorPath: "/repo/extensions/tools/src/ns-extension.ts",
				descriptor: { description: "Tools" },
			}),
		});
	});

	test("presents missing manifests with caller-specific message and code overrides", () => {
		const error: ExtensionDescriptorPackageError = {
			type: "package-manifest-missing",
			code: "extension_descriptor_package_missing",
			message: "canonical missing message",
			path: "/repo/extensions/tools/package.json",
			packageJsonPath: "/repo/extensions/tools/package.json",
		};

		expect(
			presentExtensionDescriptorPackageError({
				error,
				missingManifest: {
					code: "extension_descriptor_package_json_read_failed",
					message: "caller missing message",
				},
			}),
		).toEqual({
			code: "extension_descriptor_package_json_read_failed",
			message: "caller missing message",
			path: "/repo/extensions/tools/package.json",
		});
	});

	test("preserves nonmissing package errors despite the missing-manifest override", () => {
		const error: ExtensionDescriptorPackageError = {
			type: "package-manifest-read-failed",
			code: "extension_descriptor_package_json_read_failed",
			message: "canonical read message",
			path: "/repo/extensions/tools/package.json",
			packageJsonPath: "/repo/extensions/tools/package.json",
			causeMessage: "permission denied",
		};

		expect(
			presentExtensionDescriptorPackageError({
				error,
				missingManifest: { code: "replacement-code", message: "replacement message" },
			}),
		).toEqual({
			code: "extension_descriptor_package_json_read_failed",
			message: "canonical read message",
			path: "/repo/extensions/tools/package.json",
		});
	});

	test("returns structured candidate context without imposing a caller envelope", async () => {
		const result = await loadExtensionDescriptorFromPackageRoot({
			packageRoot: "/repo/extensions/tools",
			gateway: gateway({ descriptorFile: "missing" }),
		});

		expect(result).toEqual({
			ok: false,
			error: expect.objectContaining({
				type: "descriptor-file-missing",
				code: "extension_descriptor_export_missing_file",
				packageJsonPath: "/repo/extensions/tools/package.json",
				candidatePath: "/repo/extensions/tools/src/ns-extension.ts",
				path: "/repo/extensions/tools/src/ns-extension.ts",
			}),
		});
	});
});
