import { describe, expect, it } from "vitest";

import {
	compareApiFunctionDirectories,
	expectedApiFunctionDirectories,
	findHermeticApiFunctionProblems,
	findMissingRelativeModuleTargets,
	planHermeticApiFunction,
} from "../../src/deployability/gate.ts";

describe("API function discovery", () => {
	it("derives function directories from synthetic immediate API source entries", () => {
		const expected = expectedApiFunctionDirectories([
			"trigger.ts",
			"README.md",
			"health.ts",
			"mint.ts",
		]);

		expect(expected).toEqual(["health.func", "mint.func", "trigger.func"]);
		expect(compareApiFunctionDirectories(expected, ["health.func", "trigger.func"])).toEqual({
			missing: ["mint.func"],
			unexpected: [],
		});
	});

	it("reports an emitted function without a corresponding immediate API source", () => {
		expect(compareApiFunctionDirectories(["health.func"], ["health.func", "stale.func"])).toEqual({
			missing: [],
			unexpected: ["stale.func"],
		});
	});
});

describe("planHermeticApiFunction", () => {
	it("replaces a mapped ESM handler with a portable CommonJS bundle contract", () => {
		const plan = planHermeticApiFunction({
			handler: "api/runs.js",
			runtime: "nodejs24.x",
			architecture: "arm64",
			shouldAddSourcemapSupport: true,
			filePathMap: {
				"node_modules/workflow": "node_modules/workflow",
				"node_modules/zod": "node_modules/zod",
			},
		});

		expect(plan).toEqual({
			sourceHandler: "api/runs.js",
			bundledHandler: "api/runs.cjs",
			config: {
				handler: "api/runs.cjs",
				runtime: "nodejs24.x",
				architecture: "arm64",
				shouldAddSourcemapSupport: false,
			},
		});
	});

	it("rejects a function config without a JavaScript handler", () => {
		expect(() =>
			planHermeticApiFunction({ handler: "api/runs.ts", runtime: "nodejs24.x" }),
		).toThrow("JavaScript handler");
	});

	it("verifies the final handler inventory has no external path mappings or stale files", () => {
		expect(
			findHermeticApiFunctionProblems(
				{ handler: "api/runs.cjs", runtime: "nodejs24.x" },
				new Set([".vc-config.json", "api/runs.cjs"]),
			),
		).toEqual([]);
		expect(
			findHermeticApiFunctionProblems(
				{
					handler: "api/runs.cjs",
					runtime: "nodejs24.x",
					filePathMap: { "node_modules/zod": "node_modules/zod" },
				},
				new Set([".vc-config.json", "api/runs.cjs", "api/runs.js", "node_modules/zod/index.js"]),
			),
		).toEqual([
			"API function config still depends on filePathMap.",
			"API function contains stale file api/runs.js.",
			"API function contains stale file node_modules/zod/index.js.",
		]);
	});
});

describe("findMissingRelativeModuleTargets", () => {
	it("reports a relative module omitted from the function artifact", () => {
		const modules = new Map([
			["api/mint.js", 'import { handleMintRequest } from "../src/mint/handle.js";'],
		]);

		expect(findMissingRelativeModuleTargets(modules)).toEqual([
			{
				sourcePath: "api/mint.js",
				specifier: "../src/mint/handle.js",
				targetPath: "src/mint/handle.js",
			},
		]);
	});

	it("reports emitted JavaScript that still imports a TypeScript path", () => {
		const modules = new Map([
			["api/mint.js", 'import { handleMintRequest } from "../src/mint/handle.ts";'],
			["src/mint/handle.js", "export function handleMintRequest() {}"],
		]);

		expect(findMissingRelativeModuleTargets(modules)).toEqual([
			{
				sourcePath: "api/mint.js",
				specifier: "../src/mint/handle.ts",
				targetPath: "src/mint/handle.ts",
			},
		]);
	});

	it("accepts a closed relative-import graph", () => {
		const modules = new Map([
			["api/mint.js", 'import { handleMintRequest } from "../src/mint/handle.js";'],
			["src/mint/handle.js", 'export { parseRequest } from "./contracts.js";'],
			["src/mint/contracts.js", "export function parseRequest() {}"],
		]);

		expect(findMissingRelativeModuleTargets(modules)).toEqual([]);
	});
});
