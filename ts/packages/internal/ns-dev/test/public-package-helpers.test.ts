import { describe, expect, it } from "vitest";

import { normalizeBinPaths } from "../src/public-packages/helpers.ts";
import { repoRoot, workspaceRoot } from "../src/public-packages/package-set.ts";

describe("public package helpers", () => {
	it("resolves the workspace and repository roots from typed module ownership", () => {
		expect(workspaceRoot).toMatch(/\/ts$/u);
		expect(repoRoot).not.toMatch(/\/ts$/u);
	});

	it("keeps only string bin targets and strips leading current-directory markers", () => {
		expect(normalizeBinPaths({ ns: "./src/cli.ts", malformed: 42, absent: null })).toEqual({
			ns: "src/cli.ts",
		});
	});
});
