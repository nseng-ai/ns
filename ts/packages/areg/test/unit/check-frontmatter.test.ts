import { describe, expect, test } from "vitest";

import { derivePiReplacementCommand, formatCheckReport, parseSkillFrontmatterText } from "../../src/operations/check.ts";
import { transformSkillFrontmatter } from "../../src/operations/frontmatter.ts";

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

	test("rejects duplicate top-level keys", () => {
		expect(parseSkillFrontmatterText("---\nname: demo\nname: other\n---\n")).toEqual({ type: "error", message: 'duplicate frontmatter key: "name"' });
		expect(parseSkillFrontmatterText("---\nname: demo\ndisable-model-invocation: true\ndisable-model-invocation: false\n---\n")).toEqual({ type: "error", message: 'duplicate frontmatter key: "disable-model-invocation"' });
	});

	test("requires exact opening and closing fences", () => {
		expect(parseSkillFrontmatterText("\n---\nname: demo\n---\n")).toEqual({ type: "error", message: "missing opening frontmatter delimiter '---'" });
		expect(parseSkillFrontmatterText("--- \nname: demo\n---\n")).toEqual({ type: "error", message: "missing opening frontmatter delimiter '---'" });
		expect(parseSkillFrontmatterText("---\nname: demo\n ---\n")).toEqual({ type: "error", message: "missing closing frontmatter delimiter '---'" });
		expect(parseSkillFrontmatterText("---\nname: demo\n--- \n")).toEqual({ type: "error", message: "missing closing frontmatter delimiter '---'" });
	});
});

describe("areg SKILL.md frontmatter transform", () => {
	test("preserves prefix-like non-managed keys when adding managed keys", () => {
		const transformed = transformSkillFrontmatter(
			"---\nname: demo\ndisable-model-invocation-extra: true\nuser-invocable-extra: false\n---\nbody\n",
			"skills/demo/SKILL.md",
			{ "disable-model-invocation": "true", "user-invocable": undefined },
		);

		expect(transformed).toEqual({
			type: "ok",
			value: "---\nname: demo\ndisable-model-invocation: true\ndisable-model-invocation-extra: true\nuser-invocable-extra: false\n---\nbody\n",
		});
	});

	test("rewrites managed lines with the source CRLF style", () => {
		const transformed = transformSkillFrontmatter(
			"---\r\nname: demo\r\ndisable-model-invocation: false\r\n---\r\nbody\r\n",
			"skills/demo/SKILL.md",
			{ "disable-model-invocation": "true", "user-invocable": undefined },
		);

		expect(transformed).toEqual({ type: "ok", value: "---\r\nname: demo\r\ndisable-model-invocation: true\r\n---\r\nbody\r\n" });
	});

	test("rejects duplicate keys before rewriting", () => {
		expect(transformSkillFrontmatter("---\nname: demo\nname: other\n---\n", "skills/demo/SKILL.md", { "disable-model-invocation": "true" })).toEqual({
			type: "error",
			message: 'skills/demo/SKILL.md duplicate frontmatter key: "name"',
		});
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
