import { describe, expect, test } from "vitest";

import { transformSkillFrontmatter } from "../src/harness-artifacts/skill-frontmatter.ts";

describe("SKILL.md frontmatter transform", () => {
	test("preserves prefix-like non-managed keys when adding managed keys", () => {
		const transformed = transformSkillFrontmatter(
			"---\nname: demo\ndisable-model-invocation-extra: true\nuser-invocable-extra: false\n---\nbody\n",
			"skills/demo/SKILL.md",
			{ "disable-model-invocation": "true", "user-invocable": undefined },
		);

		expect(transformed).toEqual({
			ok: true,
			value:
				"---\nname: demo\ndisable-model-invocation: true\ndisable-model-invocation-extra: true\nuser-invocable-extra: false\n---\nbody\n",
		});
	});

	test("rewrites managed lines with the source CRLF style", () => {
		const transformed = transformSkillFrontmatter(
			"---\r\nname: demo\r\ndisable-model-invocation: false\r\n---\r\nbody\r\n",
			"skills/demo/SKILL.md",
			{ "disable-model-invocation": "true", "user-invocable": undefined },
		);

		expect(transformed).toEqual({
			ok: true,
			value: "---\r\nname: demo\r\ndisable-model-invocation: true\r\n---\r\nbody\r\n",
		});
	});

	test("rejects duplicate keys before rewriting", () => {
		expect(
			transformSkillFrontmatter("---\nname: demo\nname: other\n---\n", "skills/demo/SKILL.md", {
				"disable-model-invocation": "true",
			}),
		).toMatchObject({
			ok: false,
			error: { message: 'skills/demo/SKILL.md duplicate frontmatter key: "name"' },
		});
	});
});
