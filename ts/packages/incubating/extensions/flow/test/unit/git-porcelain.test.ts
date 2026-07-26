import { describe, expect, test } from "vitest";

import {
	isGitPorcelainUnmergedStatus,
	parseGitPorcelainStatusLine,
	parseGitPorcelainStatusOutput,
} from "../../src/changes/git-porcelain.ts";

describe("git porcelain status parsing", () => {
	test("parses the two-column status code and trimmed path", () => {
		expect(parseGitPorcelainStatusLine(" M src/app.ts")).toEqual({
			status: { raw: " M", index: " ", worktree: "M" },
			path: "src/app.ts",
		});
		expect(parseGitPorcelainStatusLine("R  old.ts -> new.ts")).toEqual({
			status: { raw: "R ", index: "R", worktree: " " },
			path: "old.ts -> new.ts",
		});
		expect(parseGitPorcelainStatusLine("AM staged-and-modified.ts")).toEqual({
			status: { raw: "AM", index: "A", worktree: "M" },
			path: "staged-and-modified.ts",
		});
	});

	test("rejects malformed or pathless status lines", () => {
		expect(parseGitPorcelainStatusLine("M")).toBeUndefined();
		expect(parseGitPorcelainStatusLine("M  ")).toBeUndefined();
	});

	test("parses status output while skipping malformed lines", () => {
		expect(parseGitPorcelainStatusOutput("UU conflict.ts\r\nx\n?? notes.md\n")).toEqual([
			{ status: { raw: "UU", index: "U", worktree: "U" }, path: "conflict.ts" },
			{ status: { raw: "??", index: "?", worktree: "?" }, path: "notes.md" },
		]);
	});

	test("identifies unmerged porcelain statuses", () => {
		const conflicted = parseGitPorcelainStatusLine("AA both-added.ts");
		const modified = parseGitPorcelainStatusLine(" M modified.ts");

		expect(conflicted).not.toBeUndefined();
		expect(modified).not.toBeUndefined();
		expect(conflicted === undefined ? false : isGitPorcelainUnmergedStatus(conflicted.status)).toBe(
			true,
		);
		expect(modified === undefined ? true : isGitPorcelainUnmergedStatus(modified.status)).toBe(
			false,
		);
	});
});
