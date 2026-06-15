import { describe, expect, test } from "vitest";

import { derivePiReplacementCommand, formatCheckReport, parseSkillFrontmatterText } from "../../src/operations/check.ts";

describe("areg check frontmatter parser", () => {
	test("parses fields, comments, continuations, and quoted values", () => {
		const result = parseSkillFrontmatterText("---\nname: demo\n# comment\ndescription: \"Command:\n  demo skill\"\n---\nbody\n");

		expect(result).toEqual({ type: "ok", fields: { name: "demo", description: "Command: demo skill" } });
	});

	test("reports durable frontmatter errors", () => {
		expect(parseSkillFrontmatterText("body\n")).toEqual({ type: "error", message: "missing opening frontmatter delimiter '---'" });
		expect(parseSkillFrontmatterText("---\nname: demo\n")).toEqual({ type: "error", message: "missing closing frontmatter delimiter '---'" });
		expect(parseSkillFrontmatterText("---\nnot a key value line\n---\n")).toEqual({ type: "error", message: 'invalid frontmatter line: "not a key value line"' });
	});
});

describe("areg check Pi replacement helpers", () => {
	test("uses specialized and namespace-derived replacement surfaces", () => {
		expect(derivePiReplacementCommand("branch-context-impl")).toBe("branch-context:impl");
		expect(derivePiReplacementCommand("objective-stack-impl")).toBe("objective:stack-impl");
		expect(derivePiReplacementCommand("custom-command")).toBe("custom:command");
		expect(derivePiReplacementCommand("nocommand")).toBeUndefined();
	});

	test("formats grouped human failures sorted by skill", () => {
		expect(
			formatCheckReport({
				issues: [
					{ skill: "zeta", code: "invalid_lock_hash", message: "bad hash" },
					{ skill: "alpha", code: "claude_missing", message: "missing claude" },
				],
			}),
		).toBe("\nalpha:\n  missing claude\n\nzeta:\n  bad hash\n\n2 error(s)");
	});
});
