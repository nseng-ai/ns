import { describe, expect, test } from "bun:test";

import { expandSkillBlock, type SkillCommandInfo } from "../src/skill-expansion.ts";

function host(commands: readonly SkillCommandInfo[]): { getCommands(): readonly SkillCommandInfo[] } {
	return {
		getCommands(): readonly SkillCommandInfo[] {
			return commands;
		},
	};
}

function skillCommand(skillName: string, path: string, baseDir?: string): SkillCommandInfo {
	return {
		name: `skill:${skillName}`,
		source: "skill",
		sourceInfo: {
			path,
			...(baseDir === undefined ? {} : { baseDir }),
		},
	};
}

describe("expandSkillBlock", () => {
	test("returns undefined and performs no read when the skill command is missing", async () => {
		const reads: string[] = [];

		const expanded = await expandSkillBlock(host([]), "objective-next", {
			readTextFile: async (path) => {
				reads.push(path);
				return "# unused";
			},
		});

		expect(expanded).toBeUndefined();
		expect(reads).toEqual([]);
	});

	test("ignores non-skill commands with the matching command name", async () => {
		const reads: string[] = [];

		const expanded = await expandSkillBlock(
			host([
				{
					name: "skill:objective-next",
					source: "prompt",
					sourceInfo: { path: "/tmp/prompt.md" },
				},
			]),
			"objective-next",
			{
				readTextFile: async (path) => {
					reads.push(path);
					return "# unused";
				},
			},
		);

		expect(expanded).toBeUndefined();
		expect(reads).toEqual([]);
	});

	test("reads the skill file, strips frontmatter, trims body, and formats the exact block", async () => {
		const expanded = await expandSkillBlock(host([skillCommand("objective-next", "/skills/objective-next/SKILL.md", "/skills/objective-next")]), "objective-next", {
			readTextFile: async (path) => {
				expect(path).toBe("/skills/objective-next/SKILL.md");
				return `---
name: objective-next
description: hidden
---

# Objective Next

Do next work.  \n`;
			},
		});

		expect(expanded).toEqual({
			name: "objective-next",
			commandName: "skill:objective-next",
			path: "/skills/objective-next/SKILL.md",
			baseDir: "/skills/objective-next",
			body: "# Objective Next\n\nDo next work.",
			block: `<skill name="objective-next" location="/skills/objective-next/SKILL.md">
References are relative to /skills/objective-next.

# Objective Next

Do next work.
</skill>`,
		});
	});

	test("uses sourceInfo.baseDir when present", async () => {
		const expanded = await expandSkillBlock(
			host([skillCommand("internal-code-just-fix", "/resolved/SKILL.md", "/source/base")]),
			"internal-code-just-fix",
			{
				readTextFile: async () => "# Internal Code Just Fix",
			},
		);

		expect(expanded?.baseDir).toBe("/source/base");
		expect(expanded?.block).toContain("References are relative to /source/base.");
	});

	test("falls back to dirname(sourceInfo.path) when baseDir is absent", async () => {
		const expanded = await expandSkillBlock(
			host([skillCommand("internal-code-just-fix", "/resolved/internal-code-just-fix/SKILL.md")]),
			"internal-code-just-fix",
			{
				readTextFile: async () => "# Internal Code Just Fix",
			},
		);

		expect(expanded?.baseDir).toBe("/resolved/internal-code-just-fix");
		expect(expanded?.block).toContain("References are relative to /resolved/internal-code-just-fix.");
	});

	test("propagates read errors", async () => {
		await expect(
			expandSkillBlock(host([skillCommand("internal-code-just-fix", "/missing/SKILL.md")]), "internal-code-just-fix", {
				readTextFile: async () => {
					throw new Error("cannot read skill");
				},
			}),
		).rejects.toThrow("cannot read skill");
	});

	test("trims Markdown without frontmatter", async () => {
		const expanded = await expandSkillBlock(
			host([skillCommand("internal-code-just-fix", "/skills/internal-code-just-fix/SKILL.md")]),
			"internal-code-just-fix",
			{
				readTextFile: async () => "\n\n# Internal Code Just Fix\n\nFix it.\n\n",
			},
		);

		expect(expanded?.body).toBe("# Internal Code Just Fix\n\nFix it.");
	});

	test("strips CRLF frontmatter", async () => {
		const expanded = await expandSkillBlock(host([skillCommand("objective-current", "C:/skills/objective-current/SKILL.md", "C:/skills/objective-current")]), "objective-current", {
			readTextFile: async () => "---\r\nname: objective-current\r\n---\r\n# Objective Current\r\n",
		});

		expect(expanded?.body).toBe("# Objective Current");
		expect(expanded?.body).not.toContain("name: objective-current");
	});
});
