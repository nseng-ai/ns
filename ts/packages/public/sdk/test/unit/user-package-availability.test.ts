import { describe, expect, it } from "vitest";

import { evaluateUserExtensionPackageAvailability } from "../../src/extensions/user-package-availability.ts";
import type { ExtensionDescriptorPackageGateway } from "../../src/project-config/extension-package-descriptor.ts";

const gateway: ExtensionDescriptorPackageGateway = {
	async readPackageManifest(packageJsonPath: string) {
		const name = packageJsonPath.includes("/one/") ? "@test/one" : "@test/two";
		return {
			type: "found" as const,
			text: JSON.stringify({
				name,
				version: "1.0.0",
				exports: { "./ns-extension": "./extension.ts" },
			}),
		};
	},
	async inspectDescriptorFile(_descriptorPath: string) {
		return { type: "found" as const };
	},
	async importDescriptorDefault(descriptorPath: string) {
		const first = descriptorPath.includes("/one/");
		return {
			ok: true as const,
			defaultExport: {
				description: "test",
				commandDirectory: first ? "/commands/one" : "/commands/two",
			},
		};
	},
};

describe("evaluateUserExtensionPackageAvailability", () => {
	it("returns one attributable fact per User declaration and excludes Project by construction", async () => {
		const facts = await evaluateUserExtensionPackageAvailability({
			configDir: "/config/ns",
			sourceSpecs: ["/extensions/one", "/extensions/two"],
			descriptorGateway: gateway,
			preinstalledSources: () => [],
		});
		expect(facts).toEqual([
			expect.objectContaining({
				sourceSpec: "/extensions/one",
				packageName: "@test/one",
				availability: "available",
			}),
			expect.objectContaining({
				sourceSpec: "/extensions/two",
				packageName: "@test/two",
				availability: "available",
			}),
		]);
	});

	it("rejects every package in a same-User conflict", async () => {
		const facts = await evaluateUserExtensionPackageAvailability({
			configDir: "/config/ns",
			sourceSpecs: ["/extensions/one", "/extensions/one"],
			descriptorGateway: gateway,
			preinstalledSources: () => [],
		});
		expect(facts.every((fact) => fact.availability === "unavailable")).toBe(true);
	});
});
