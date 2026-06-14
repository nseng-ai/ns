import { describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expandSkillBlock, expandSkillBlockFromPath, invokeSkillPromptTurn, type SkillCommandInfo } from "../src/skill-expansion.ts";

function host(commands: readonly SkillCommandInfo[]): { getCommands(): readonly SkillCommandInfo[] } {
	return {
		getCommands(): readonly SkillCommandInfo[] {
			return commands;
		},
	};
}

function promptTurnHost(commands: readonly SkillCommandInfo[]): {
	sentUserMessages: string[];
	getCommands(): readonly SkillCommandInfo[];
	sendUserMessage(content: string): void;
} {
	const sentUserMessages: string[] = [];
	return {
		sentUserMessages,
		getCommands(): readonly SkillCommandInfo[] {
			return commands;
		},
		sendUserMessage(content: string): void {
			sentUserMessages.push(content);
		},
	};
}

function promptTurnContext(): {
	notifications: Array<{ message: string; level: "info" | "warning" | undefined }>;
	waits: () => number;
	ctx: {
		hasUI: boolean;
		ui: { notify(message: string, level?: "info" | "warning"): void };
		waitForIdle(): Promise<void>;
	};
} {
	const notifications: Array<{ message: string; level: "info" | "warning" | undefined }> = [];
	let waitCount = 0;
	return {
		notifications,
		waits: () => waitCount,
		ctx: {
			hasUI: true,
			ui: {
				notify(message: string, level?: "info" | "warning"): void {
					notifications.push({ message, level });
				},
			},
			async waitForIdle(): Promise<void> {
				waitCount += 1;
			},
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
			host([skillCommand("code-just-fix", "/resolved/SKILL.md", "/source/base")]),
			"code-just-fix",
			{
				readTextFile: async () => "# Internal Code Just Fix",
			},
		);

		expect(expanded?.baseDir).toBe("/source/base");
		expect(expanded?.block).toContain("References are relative to /source/base.");
	});

	test("falls back to dirname(sourceInfo.path) when baseDir is absent", async () => {
		const expanded = await expandSkillBlock(
			host([skillCommand("code-just-fix", "/resolved/code-just-fix/SKILL.md")]),
			"code-just-fix",
			{
				readTextFile: async () => "# Internal Code Just Fix",
			},
		);

		expect(expanded?.baseDir).toBe("/resolved/code-just-fix");
		expect(expanded?.block).toContain("References are relative to /resolved/code-just-fix.");
	});

	test("propagates read errors", async () => {
		await expect(
			expandSkillBlock(host([skillCommand("code-just-fix", "/missing/SKILL.md")]), "code-just-fix", {
				readTextFile: async () => {
					throw new Error("cannot read skill");
				},
			}),
		).rejects.toThrow("cannot read skill");
	});

	test("trims Markdown without frontmatter", async () => {
		const expanded = await expandSkillBlock(
			host([skillCommand("code-just-fix", "/skills/code-just-fix/SKILL.md")]),
			"code-just-fix",
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

describe("expandSkillBlockFromPath", () => {
	test("reads a direct skill file path, strips frontmatter, and formats the block", async () => {
		const expanded = await expandSkillBlockFromPath({
			skillName: "objective-create",
			skillPath: "/repo/skills/objective-create/SKILL.md",
			readTextFile: async (path) => {
				expect(path).toBe("/repo/skills/objective-create/SKILL.md");
				return "---\nname: objective-create\n---\n\n# Objective Create\n";
			},
		});

		expect(expanded).toEqual({
			name: "objective-create",
			commandName: "direct:objective-create",
			path: "/repo/skills/objective-create/SKILL.md",
			baseDir: "/repo/skills/objective-create",
			body: "# Objective Create",
			block: `<skill name="objective-create" location="/repo/skills/objective-create/SKILL.md">
References are relative to /repo/skills/objective-create.

# Objective Create
</skill>`,
		});
	});

	test("propagates direct path read errors", async () => {
		await expect(
			expandSkillBlockFromPath({
				skillName: "objective-create",
				skillPath: "/repo/skills/objective-create/SKILL.md",
				readTextFile: async () => {
					throw new Error("cannot read direct skill");
				},
			}),
		).rejects.toThrow("cannot read direct skill");
	});
});

describe("invokeSkillPromptTurn", () => {
	test("waits, expands the skill, notifies, and sends the built prompt", async () => {
		const dir = await mkdtemp(join(tmpdir(), "skill-prompt-turn-"));
		const skillPath = join(dir, "SKILL.md");
		await writeFile(skillPath, "---\nname: objective-create\n---\n\n# Objective Create\n", "utf8");
		try {
			const testHost = promptTurnHost([skillCommand("objective-create", skillPath, dir)]);
			const context = promptTurnContext();

			await invokeSkillPromptTurn({
				host: testHost,
				ctx: context.ctx,
				skillName: "objective-create",
				successMessage: (skill) => `Starting ${skill.name}`,
				fallbackMessage: "missing skill",
				buildPrompt: (skillBlock) => `prompt:\n${skillBlock ?? "fallback"}`,
			});

			expect(context.waits()).toBe(1);
			expect(context.notifications).toEqual([{ message: "Starting objective-create", level: "info" }]);
			expect(testHost.sentUserMessages).toHaveLength(1);
			expect(testHost.sentUserMessages[0]).toContain(`<skill name="objective-create" location="${skillPath}">`);
			expect(testHost.sentUserMessages[0]).toContain("# Objective Create");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("uses the fallback prompt and warning when the skill is unavailable", async () => {
		const testHost = promptTurnHost([]);
		const context = promptTurnContext();

		await invokeSkillPromptTurn({
			host: testHost,
			ctx: context.ctx,
			skillName: "objective-create",
			successMessage: "unused",
			fallbackMessage: "objective-create skill was not found; using fallback prompt.",
			buildPrompt: (skillBlock) => skillBlock ?? "fallback prompt",
		});

		expect(context.waits()).toBe(1);
		expect(context.notifications).toEqual([
			{ message: "objective-create skill was not found; using fallback prompt.", level: "warning" },
		]);
		expect(testHost.sentUserMessages).toEqual(["fallback prompt"]);
	});
});
