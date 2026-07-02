import { describe, expect, test } from "vitest";

import { parseGitStatusPaths } from "@sdl/capability-kit/git";

describe("parseGitStatusPaths", () => {
	test("returns empty facts for clean status output", () => {
		expect(parseGitStatusPaths("")).toEqual({
			ok: true,
			value: { changedPaths: [], stagedPaths: [] },
		});
		expect(parseGitStatusPaths("\n\n")).toEqual({
			ok: true,
			value: { changedPaths: [], stagedPaths: [] },
		});
	});

	test("splits staged and unstaged paths by index status", () => {
		const raw = [
			"M  staged-modified.ts",
			" M unstaged-modified.ts",
			"A  staged-added.ts",
			"?? untracked.ts",
			"MM staged-and-dirty.ts",
		].join("\n");

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
				stagedPaths: ["staged-modified.ts", "staged-added.ts", "staged-and-dirty.ts"],
			},
		});
	});

	test("resolves rename and copy lines to their targets", () => {
		const raw = ["R  old-name.ts -> new-name.ts", "C  base.ts -> copy.ts"].join("\n");

		expect(parseGitStatusPaths(raw)).toEqual({
			ok: true,
			value: {
				changedPaths: ["new-name.ts", "copy.ts"],
				stagedPaths: ["new-name.ts", "copy.ts"],
			},
		});
	});

	test("dedupes repeated paths while preserving first-seen order", () => {
		const raw = ["M  dupe.ts", "M  dupe.ts", " M other.ts"].join("\n");

		expect(parseGitStatusPaths(raw)).toEqual({
			ok: true,
			value: { changedPaths: ["dupe.ts", "other.ts"], stagedPaths: ["dupe.ts"] },
		});
	});

	test("reports malformed lines as parse failures", () => {
		const missingSeparator = parseGitStatusPaths("MM=broken.ts");
		expect(missingSeparator).toMatchObject({
			ok: false,
			error: { code: "git_status_parse_failed" },
		});
		if (!missingSeparator.ok) {
			expect(missingSeparator.error.message).toContain("MM=broken.ts");
		}

		expect(parseGitStatusPaths("M ")).toMatchObject({
			ok: false,
			error: { code: "git_status_parse_failed" },
		});
	});
});
