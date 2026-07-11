import { describe, expect, test } from "vitest";

import {
	loadExtensionDescriptorFromPackageRoot,
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
