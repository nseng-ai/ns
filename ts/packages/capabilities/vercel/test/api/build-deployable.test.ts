import { describe, expect, it } from "vitest";

import { findMissingRelativeModuleTargets } from "../../scripts/build-deployable.ts";

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
