import { describe, expect, test } from "vitest";

import {
	parseGitPorcelainStatusLine,
	parseGitPorcelainStatusOutput,
} from "../../src/shared/git-porcelain.ts";

describe("git porcelain status parsing", () => {
	test("parses the two-column status code and trimmed path", () => {
		expect(parseGitPorcelainStatusLine(" M src/app.ts")).toEqual({
			status: " M",
			path: "src/app.ts",
		});
		expect(parseGitPorcelainStatusLine("R  old.ts -> new.ts")).toEqual({
			status: "R ",
			path: "old.ts -> new.ts",
		});
	});

	test("rejects malformed or pathless status lines", () => {
		expect(parseGitPorcelainStatusLine("M")).toBeUndefined();
		expect(parseGitPorcelainStatusLine("M  ")).toBeUndefined();
	});

	test("parses status output while skipping malformed lines", () => {
		expect(parseGitPorcelainStatusOutput("UU conflict.ts\r\nx\n?? notes.md\n")).toEqual([
			{ status: "UU", path: "conflict.ts" },
			{ status: "??", path: "notes.md" },
		]);
	});
});
