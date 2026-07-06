import { describe, expect, test } from "vitest";

import { parseGitStatusPaths } from "../../src/git/status-paths.ts";

describe("parseGitStatusPaths", () => {
	test("returns empty facts for clean NUL-delimited status output", () => {
		expect(parseGitStatusPaths("")).toEqual({
			ok: true,
			value: { changedPaths: [] },
		});
		expect(parseGitStatusPaths("\0")).toEqual({
			ok: true,
			value: { changedPaths: [] },
		});
	});

	test("collects staged, unstaged, and untracked paths as changed paths", () => {
		const raw = [
			"M  staged-modified.ts",
			" M unstaged-modified.ts",
			"A  staged-added.ts",
			"?? untracked.ts",
			"MM staged-and-dirty.ts",
			"",
		].join("\0");

		expect(parseGitStatusPaths(raw)).toEqual({
			ok: true,
			value: {
				changedPaths: [
					"staged-modified.ts",
					"unstaged-modified.ts",
					"staged-added.ts",
					"untracked.ts",
					"staged-and-dirty.ts",
				],
			},
		});
	});

	test("preserves raw UTF-8, quotes, and spaces", () => {
		const raw = ["A  résumé.md", '?? quote"file.txt', " M dir with spaces/file name.txt", ""].join(
			"\0",
		);

		expect(parseGitStatusPaths(raw)).toEqual({
			ok: true,
			value: {
				changedPaths: ["résumé.md", 'quote"file.txt', "dir with spaces/file name.txt"],
			},
		});
	});

	test("resolves rename and copy records to target paths and consumes source paths", () => {
		const raw = ["R  new name.ts", "old name.ts", "C  copy.ts", "base.ts", ""].join("\0");

		expect(parseGitStatusPaths(raw)).toEqual({
			ok: true,
			value: { changedPaths: ["new name.ts", "copy.ts"] },
		});
	});

	test("dedupes repeated paths while preserving first-seen order", () => {
		const raw = ["M  dupe.ts", "M  dupe.ts", " M other.ts", ""].join("\0");

		expect(parseGitStatusPaths(raw)).toEqual({
			ok: true,
			value: { changedPaths: ["dupe.ts", "other.ts"] },
		});
	});

	test("reports malformed records as parse failures", () => {
		const missingSeparator = parseGitStatusPaths("MM=broken.ts\0");
		expect(missingSeparator).toMatchObject({
			ok: false,
			error: { code: "git_status_parse_failed" },
		});
		if (!missingSeparator.ok) {
			expect(missingSeparator.error.message).toContain("MM=broken.ts");
		}

		expect(parseGitStatusPaths("M \0")).toMatchObject({
			ok: false,
			error: { code: "git_status_parse_failed" },
		});
	});

	test("reports rename and copy records with missing sources as parse failures", () => {
		expect(parseGitStatusPaths("R  new-name.ts\0")).toMatchObject({
			ok: false,
			error: { code: "git_status_parse_failed" },
		});
		expect(parseGitStatusPaths("C  copy.ts\0\0")).toMatchObject({
			ok: false,
			error: { code: "git_status_parse_failed" },
		});
	});
});
