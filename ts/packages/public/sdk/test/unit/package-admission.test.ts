import { describe, expect, it } from "vitest";

import {
	planExtensionPackageAdmission,
	type ExtensionPackageContribution,
} from "../../src/extensions/package-admission.ts";

function contribution(options: {
	id: string;
	name?: string;
	level: "preinstalled" | "user" | "project";
	commands?: readonly string[];
	commandMetadata?: ExtensionPackageContribution<string>["commandMetadata"];
	requires?: readonly string[];
}): ExtensionPackageContribution<string> {
	return {
		contributionId: options.id,
		packageName: options.name ?? options.id,
		level: options.level,
		commandKeys: options.commands ?? [],
		...(options.commandMetadata === undefined ? {} : { commandMetadata: options.commandMetadata }),
		requiresExtensions: options.requires ?? [],
		payload: options.id,
	};
}

describe("planExtensionPackageAdmission", () => {
	it("rejects every same-level package participating in a command-shape conflict", () => {
		const plan = planExtensionPackageAdmission({
			builtInCommandKeys: [],
			contributions: [
				contribution({ id: "a", level: "user", commands: ["tools"] }),
				contribution({ id: "b", level: "user", commands: ["tools/run"] }),
			],
		});
		expect(plan.admitted).toEqual([]);
		expect(plan.diagnostics.map((diagnostic) => diagnostic.contributionId)).toEqual(["a", "b"]);
	});

	it("keeps the whole higher package and rejects the whole lower package", () => {
		const plan = planExtensionPackageAdmission({
			builtInCommandKeys: [],
			contributions: [
				contribution({ id: "low", level: "user", commands: ["shared", "low-only"] }),
				contribution({ id: "high", level: "project", commands: ["shared", "high-only"] }),
			],
		});
		expect(plan.admitted.map((item) => item.contributionId)).toEqual(["high"]);
		expect(plan.extensionPackageNames).toEqual(new Set(["high"]));
	});

	it("admits commandless providers and requirement cycles, then cascades rejection", () => {
		const cycle = planExtensionPackageAdmission({
			builtInCommandKeys: [],
			contributions: [
				contribution({ id: "a-source", name: "a", level: "user", requires: ["b"] }),
				contribution({ id: "b-source", name: "b", level: "user", requires: ["a"] }),
			],
		});
		expect(cycle.extensionPackageNames).toEqual(new Set(["a", "b"]));

		const cascade = planExtensionPackageAdmission({
			builtInCommandKeys: ["reserved"],
			contributions: [
				contribution({ id: "provider", level: "user", commands: ["reserved"] }),
				contribution({ id: "consumer", level: "user", requires: ["provider"] }),
			],
		});
		expect(cascade.admitted).toEqual([]);
		expect(cascade.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"extension_package_builtin_conflict",
			"extension_package_requirement_unsatisfied",
		]);
	});

	it("rejects a whole package for invalid intrinsic command name, group, or path metadata", () => {
		for (const commandMetadata of [
			[{ name: "bad name", group: "tools", path: ["tools", "bad name"] }],
			[{ name: "scan", group: "bad group", path: ["bad group", "scan"] }],
			[{ name: "scan", group: "tools", path: ["tools", "bad path"] }],
		] as const) {
			const plan = planExtensionPackageAdmission({
				builtInCommandKeys: [],
				contributions: [
					contribution({
						id: "invalid-source",
						name: "@example/invalid",
						level: "user",
						commands: [commandMetadata[0].path.join("/")],
						commandMetadata,
					}),
				],
			});
			expect(plan.admitted).toEqual([]);
			expect(plan.diagnostics).toEqual([
				expect.objectContaining({
					code: "extension_package_command_metadata_invalid",
					packageName: "@example/invalid",
					contributionId: "invalid-source",
					commandName: commandMetadata[0].path.join("/"),
				}),
			]);
			expect(plan.diagnostics[0]?.message).toContain("the whole package was rejected");
		}
	});

	it("reports every reserved built-in path affected by a package collision", () => {
		const plan = planExtensionPackageAdmission({
			builtInCommandKeys: ["extension/point", "extension/points"],
			contributions: [contribution({ id: "consumer", level: "user", commands: ["extension"] })],
		});
		expect(plan.diagnostics).toEqual([
			expect.objectContaining({
				code: "extension_package_builtin_conflict",
				commandName: "extension",
				affectedCommandNames: ["extension/point", "extension/points"],
			}),
		]);
	});

	it("does not reconsider a lower package after its higher-precedence conflict later fails requirements", () => {
		const plan = planExtensionPackageAdmission({
			builtInCommandKeys: [],
			contributions: [
				contribution({ id: "low", level: "user", commands: ["shared"] }),
				contribution({
					id: "high",
					level: "project",
					commands: ["shared"],
					requires: ["missing"],
				}),
			],
		});
		expect(plan.admitted).toEqual([]);
		expect(plan.rejected.map((item) => item.contributionId)).toEqual(["high", "low"]);
		expect(plan.diagnostics.map((item) => item.code)).toEqual([
			"extension_package_lower_level_conflict",
			"extension_package_requirement_unsatisfied",
		]);
	});

	it("keeps contribution identity distinct from duplicate manifest package names", () => {
		const plan = planExtensionPackageAdmission({
			builtInCommandKeys: [],
			contributions: [
				contribution({ id: "source-one", name: "same", level: "user", commands: ["one"] }),
				contribution({ id: "source-two", name: "same", level: "user", commands: ["two"] }),
			],
		});
		expect(plan.admitted.map((item) => item.contributionId)).toEqual(["source-one", "source-two"]);
		expect(plan.extensionPackageNames).toEqual(new Set(["same"]));
	});
});
