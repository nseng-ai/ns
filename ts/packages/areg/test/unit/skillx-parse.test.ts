import { describe, expect, test } from "vitest";

import { parseSkillInput } from "../../src/operations/skillx.ts";

describe("skillx parser", () => {
	test("parses GitHub URLs with skill path", () => {
		expect(parseSkillInput("https://github.com/owner/repo/blob/main/skills/demo/SKILL.md")).toEqual({
			type: "ok",
			data: { success: true, repo: "owner/repo", skill: "demo", format: "url" },
		});
	});

	test("parses GitHub repo URLs without a skill", () => {
		expect(parseSkillInput("https://github.com/owner/repo")).toEqual({
			type: "ok",
			data: { success: true, repo: "owner/repo", skill: null, format: "url" },
		});
	});

	test("parses explicit skill flags", () => {
		expect(parseSkillInput("owner/repo --skill demo")).toEqual({
			type: "ok",
			data: { success: true, repo: "owner/repo", skill: "demo", format: "skill_flag" },
		});
		expect(parseSkillInput("owner/repo -s demo")).toEqual({
			type: "ok",
			data: { success: true, repo: "owner/repo", skill: "demo", format: "skill_flag" },
		});
	});

	test("parses plain repo plus skill and repo-only inputs", () => {
		expect(parseSkillInput("owner/repo demo")).toEqual({
			type: "ok",
			data: { success: true, repo: "owner/repo", skill: "demo", format: "plain" },
		});
		expect(parseSkillInput("owner/repo")).toEqual({
			type: "ok",
			data: { success: true, repo: "owner/repo", skill: null, format: "repo_only" },
		});
	});

	test("rejects empty, arbitrary, and legacy owner/repo@skill input", () => {
		expect(parseSkillInput("   ")).toEqual({ type: "error", data: { success: false, error: "Empty input" } });
		expect(parseSkillInput("not a repo")).toEqual({
			type: "error",
			data: { success: false, error: 'Could not extract owner/repo from input: "not a repo"' },
		});
		expect(parseSkillInput("owner/repo@demo")).toMatchObject({ type: "error" });
	});

	test("accepts dots, hyphens, and underscores in repo components", () => {
		expect(parseSkillInput("own.er-name/re_po.name skill-name")).toEqual({
			type: "ok",
			data: { success: true, repo: "own.er-name/re_po.name", skill: "skill-name", format: "plain" },
		});
	});
});
