import { describe, expect, test } from "vitest";

import { commandBackedSkillSurface } from "../../src/command-backed-skill-registry.ts";

import { formatCheckReport, parseSkillFrontmatterText } from "../../src/operations/check.ts";

describe("areg check frontmatter parser", () => {
	test("parses fields, comments, continuations, and quoted values", () => {
		const result = parseSkillFrontmatterText(
			'---\nname: demo\n# comment\ndescription: "Command:\n  demo skill"\n---\nbody\n',
		);

		expect(result).toEqual({
			ok: true,
			value: { name: "demo", description: "Command: demo skill" },
		});
	});

	test("reports durable frontmatter errors", () => {
		expect(parseSkillFrontmatterText("body\n")).toMatchObject({
			ok: false,
			error: { message: "missing opening frontmatter delimiter '---'" },
		});
		expect(parseSkillFrontmatterText("---\nname: demo\n")).toMatchObject({
			ok: false,
			error: { message: "missing closing frontmatter delimiter '---'" },
		});
		expect(parseSkillFrontmatterText("---\nnot a key value line\n---\n")).toMatchObject({
			ok: false,
			error: { message: 'invalid frontmatter line: "not a key value line"' },
		});
	});

	test("rejects duplicate top-level keys", () => {
		expect(parseSkillFrontmatterText("---\nname: demo\nname: other\n---\n")).toMatchObject({
			ok: false,
			error: { message: 'duplicate frontmatter key: "name"' },
		});
		expect(
			parseSkillFrontmatterText(
				"---\nname: demo\ndisable-model-invocation: true\ndisable-model-invocation: false\n---\n",
			),
		).toMatchObject({
			ok: false,
			error: { message: 'duplicate frontmatter key: "disable-model-invocation"' },
		});
	});

	test("requires exact opening and closing fences", () => {
		expect(parseSkillFrontmatterText("\n---\nname: demo\n---\n")).toMatchObject({
			ok: false,
			error: { message: "missing opening frontmatter delimiter '---'" },
		});
		expect(parseSkillFrontmatterText("--- \nname: demo\n---\n")).toMatchObject({
			ok: false,
			error: { message: "missing opening frontmatter delimiter '---'" },
		});
		expect(parseSkillFrontmatterText("---\nname: demo\n ---\n")).toMatchObject({
			ok: false,
			error: { message: "missing closing frontmatter delimiter '---'" },
		});
		expect(parseSkillFrontmatterText("---\nname: demo\n--- \n")).toMatchObject({
			ok: false,
			error: { message: "missing closing frontmatter delimiter '---'" },
		});
	});
});

describe("areg check Pi replacement helpers", () => {
	test("uses registry-backed replacement surfaces", () => {
		expect(commandBackedSkillSurface("branch-context-impl")).toBe(
			"ns:branch-context:impl-attached-plan",
		);
		expect(commandBackedSkillSurface("objective-autorun")).toBe("ns:objective:autorun");
		expect(commandBackedSkillSurface("custom-command")).toBeUndefined();
		expect(commandBackedSkillSurface("nocommand")).toBeUndefined();
	});

	test("formats grouped human failures sorted by skill", () => {
		expect(
			formatCheckReport({
				issues: [
					{ skill: "zeta", code: "invalid-lock-hash", message: "bad hash" },
					{ skill: "alpha", code: "claude-missing", message: "missing claude" },
				],
			}),
		).toBe("\nalpha:\n  missing claude\n\nzeta:\n  bad hash\n\n2 error(s)");
	});
});
