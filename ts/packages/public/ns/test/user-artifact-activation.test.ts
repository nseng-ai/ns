import { describe, expect, test } from "vitest";

import type { DeclaredExtensionDescriptor } from "@nseng-ai/sdk/extensions/declared-descriptors";

import { createEmptyPreparedHarnessArtifactTransitions } from "../src/harness-artifacts/api.ts";
import { InMemoryUserArtifactActivationGateway } from "../src/init/testing/index.ts";

const descriptor: DeclaredExtensionDescriptor = {
	spec: "/extensions/tools",
	sourceKind: "local",
	moduleRoot: "/extensions/tools",
	descriptorPath: "/extensions/tools/extension.ts",
	packageName: "@test/tools",
	version: "1.0.0",
	descriptor: { description: "tools" },
};

describe("InMemoryUserArtifactActivationGateway", () => {
	test("captures targeted semantic preparation facts and copies caller collections", async () => {
		const gateway = new InMemoryUserArtifactActivationGateway();
		const configuredHarnesses = ["pi", "codex"] as const;
		const targetPackageNames = ["@test/tools"];

		const result = await gateway.prepare({
			cwd: "/work",
			descriptors: [descriptor],
			configuredHarnesses,
			targetPackageNames,
		});
		targetPackageNames.push("@test/unrelated");

		expect(result).toMatchObject({
			ok: true,
			prepared: {
				selectedHarnesses: ["pi", "codex"],
				reconciliation: { conflictPolicy: { type: "strict", shouldForce: false } },
			},
		});
		expect(gateway.prepareCalls()).toEqual([
			{
				cwd: "/work",
				descriptors: [descriptor],
				configuredHarnesses: ["pi", "codex"],
				targetPackageNames: ["@test/tools"],
			},
		]);
	});

	test("returns configured preparation failures and never applies", async () => {
		const gateway = new InMemoryUserArtifactActivationGateway({
			prepareResult: {
				ok: false,
				error: {
					code: "missing_home_directory",
					message: "home unavailable",
					details: { harness: "pi", scope: "user" },
				},
			},
		});

		await expect(
			gateway.prepare({
				cwd: "/work",
				descriptors: [descriptor],
				configuredHarnesses: ["pi"],
				targetPackageNames: ["@test/tools"],
			}),
		).resolves.toEqual({
			ok: false,
			error: {
				code: "missing_home_directory",
				message: "home unavailable",
				details: { harness: "pi", scope: "user" },
			},
		});
		expect(gateway.applyCalls()).toEqual([]);
	});

	test("returns configured prepared outcomes and apply failures as defensive copies", async () => {
		const prepared = {
			modules: [],
			selectedHarnesses: ["pi" as const],
			diagnostics: [],
			skippedCollisions: [],
			artifacts: [],
			reconciliation: createEmptyPreparedHarnessArtifactTransitions({
				type: "strict",
				shouldForce: false,
			}),
		};
		const gateway = new InMemoryUserArtifactActivationGateway({
			prepareResult: { ok: true, prepared },
			applyResult: {
				ok: false,
				error: {
					code: "stale_prepared_reconciliation",
					message: "target changed",
					details: { kind: "target", path: "/home/test/.pi/skills/tools", installKey: "pi:tools" },
					completedTransitions: new Map(),
				},
				completed: [],
			},
		});

		const preparation = await gateway.prepare({
			cwd: "/work",
			descriptors: [descriptor],
			configuredHarnesses: ["pi"],
			targetPackageNames: ["@test/tools"],
		});
		expect(preparation).toEqual({ ok: true, prepared });
		if (!preparation.ok) throw new Error("Expected configured preparation.");
		await expect(gateway.apply(preparation.prepared)).resolves.toMatchObject({
			ok: false,
			error: { code: "stale_prepared_reconciliation", message: "target changed" },
			completed: [],
		});
		expect(gateway.applyCalls()).toEqual([prepared]);
	});

	test("missing configured harnesses remain an explicit empty selection", async () => {
		const gateway = new InMemoryUserArtifactActivationGateway();
		const result = await gateway.prepare({
			cwd: "/work",
			descriptors: [descriptor],
			configuredHarnesses: [],
			targetPackageNames: ["@test/tools"],
		});

		expect(result).toMatchObject({ ok: true, prepared: { selectedHarnesses: [] } });
	});
});
