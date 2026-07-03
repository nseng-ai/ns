import { describe, expect, test } from "vitest";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { withTempGitRepo, withTempRepoSkill } from "@ji/core/test-kit";

import {
	buildFencedTextBlock,
	buildSkillInvocationPrompt,
	expandRepoSkillBlock,
	expandSkillBlock,
	expandSkillBlockFromPath,
	invokeSkillPromptTurn,
	resolveRepoSkillPath,
	type SkillCommandInfo,
} from "../src/kit/skills/expansion.ts";

function host(commands: readonly SkillCommandInfo[]): {
	getCommands(): readonly SkillCommandInfo[];
} {
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
		const expanded = await expandSkillBlock(
			host([
				skillCommand("objective-next", "/skills/objective-next/SKILL.md", "/skills/objective-next"),
			]),
			"objective-next",
			{
				readTextFile: async (path) => {
					expect(path).toBe("/skills/objective-next/SKILL.md");
					return `---
name: objective-next
description: hidden
---

# Objective Next

Do next work.  \n`;
				},
			},
		);

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
			expandSkillBlock(
				host([skillCommand("code-just-fix", "/missing/SKILL.md")]),
				"code-just-fix",
				{
					readTextFile: async () => {
						throw new Error("cannot read skill");
					},
				},
			),
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
		const expanded = await expandSkillBlock(
			host([
				skillCommand(
					"objective-next",
					"C:/skills/objective-next/SKILL.md",
					"C:/skills/objective-next",
				),
			]),
			"objective-next",
			{
				readTextFile: async () => "---\r\nname: objective-next\r\n---\r\n# Objective Next\r\n",
			},
		);

		expect(expanded?.body).toBe("# Objective Next");
		expect(expanded?.body).not.toContain("name: objective-next");
	});

	test("rejects exact opening frontmatter without an exact closing fence", async () => {
		await expect(
			expandSkillBlock(
				host([skillCommand("objective-next", "/skills/objective-next/SKILL.md")]),
				"objective-next",
				{
					readTextFile: async () => "---\nname: objective-next\n# Objective Next\n",
				},
			),
		).rejects.toThrow('Skill Markdown frontmatter is missing a closing "---" fence.');
	});

	test("treats near opening fences as body text", async () => {
		const expanded = await expandSkillBlock(
			host([skillCommand("objective-next", "/skills/objective-next/SKILL.md")]),
			"objective-next",
			{
				readTextFile: async () => "--- \nname: objective-next\n---\n# Objective Next\n",
			},
		);

		expect(expanded?.body).toBe("--- \nname: objective-next\n---\n# Objective Next");
	});

	test("does not strip prose fences after the first line", async () => {
		const expanded = await expandSkillBlock(
			host([skillCommand("objective-next", "/skills/objective-next/SKILL.md")]),
			"objective-next",
			{
				readTextFile: async () => "# Objective Next\n\n---\nnot frontmatter\n---\n",
			},
		);

		expect(expanded?.body).toBe("# Objective Next\n\n---\nnot frontmatter\n---");
	});
});

describe("repo skill expansion", () => {
	test("walks up from cwd and expands skills/<name>/SKILL.md directly", async () => {
		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: "---\nname: objective-create\n---\n\n# Objective Create\n",
				prefix: "repo-skill-expansion-",
			},
			async ({ repoDir, skillDir, skillPath }) => {
				const nestedCwd = join(repoDir, "packages", "example");
				await mkdir(nestedCwd, { recursive: true });

				expect(await resolveRepoSkillPath({ cwd: nestedCwd, skillName: "objective-create" })).toBe(
					skillPath,
				);
				const expanded = await expandRepoSkillBlock({
					cwd: nestedCwd,
					skillName: "objective-create",
				});
				expect(expanded.block).toContain(`References are relative to ${skillDir}.`);
				expect(expanded.block).toContain("# Objective Create");
			},
		);
	});

	test("falls back to vendored .agents/skills/<name>/SKILL.md backing skills", async () => {
		await withTempRepoSkill(
			{
				skillName: "improve-codebase-architecture",
				markdown:
					"---\nname: improve-codebase-architecture\n---\n\n# Improve Codebase Architecture\n",
				prefix: "repo-vendored-skill-expansion-",
				skillRoot: join(".agents", "skills"),
			},
			async ({ repoDir, skillPath }) => {
				const nestedCwd = join(repoDir, "packages", "example");
				await mkdir(nestedCwd, { recursive: true });

				expect(
					await resolveRepoSkillPath({
						cwd: nestedCwd,
						skillName: "improve-codebase-architecture",
					}),
				).toBe(skillPath);
				const expanded = await expandRepoSkillBlock({
					cwd: nestedCwd,
					skillName: "improve-codebase-architecture",
				});
				expect(expanded.block).toContain("# Improve Codebase Architecture");
			},
		);
	});

	test("uses shared skill lookup precedence across repo, vendored, and Claude roots", async () => {
		await withTempGitRepo({ prefix: "repo-skill-precedence-" }, async ({ repoDir }) => {
			const nestedCwd = join(repoDir, "packages", "example");
			await mkdir(nestedCwd, { recursive: true });
			for (const root of ["skills", join(".agents", "skills"), join(".claude", "skills")]) {
				const skillDir = join(repoDir, root, "shared");
				await mkdir(skillDir, { recursive: true });
				await writeFile(join(skillDir, "SKILL.md"), `# ${root}\n`, "utf8");
			}

			expect(await resolveRepoSkillPath({ cwd: nestedCwd, skillName: "shared" })).toBe(
				join(repoDir, "skills", "shared", "SKILL.md"),
			);
		});
	});

	test("falls back to Claude-root .claude/skills/<name>/SKILL.md backing skills", async () => {
		await withTempRepoSkill(
			{
				skillName: "code-gh",
				markdown: "---\nname: code-gh\n---\n\n# Code GH\n",
				prefix: "repo-claude-skill-expansion-",
				skillRoot: join(".claude", "skills"),
			},
			async ({ repoDir, skillPath }) => {
				const nestedCwd = join(repoDir, "packages", "example");
				await mkdir(nestedCwd, { recursive: true });

				expect(await resolveRepoSkillPath({ cwd: nestedCwd, skillName: "code-gh" })).toBe(
					skillPath,
				);
				const expanded = await expandRepoSkillBlock({
					cwd: nestedCwd,
					skillName: "code-gh",
				});
				expect(expanded.block).toContain("# Code GH");
			},
		);
	});

	test("bounds repo skill lookup to the containing Git root", async () => {
		await withTempGitRepo(
			{ prefix: "repo-skill-git-root-", repoName: "repo" },
			async ({ repoDir, tempDir }) => {
				const parentSkillDir = join(tempDir, "skills", "parent-only");
				const nestedCwd = join(repoDir, "packages", "example");
				await mkdir(parentSkillDir, { recursive: true });
				await mkdir(nestedCwd, { recursive: true });
				await writeFile(join(parentSkillDir, "SKILL.md"), "# Parent\n", "utf8");

				await expect(
					resolveRepoSkillPath({ cwd: nestedCwd, skillName: "parent-only" }),
				).rejects.toThrow("Could not find skills/parent-only/SKILL.md");
			},
		);
	});

	test("allows symlinked skill directories but rejects directly symlinked SKILL.md files", async () => {
		await withTempGitRepo({ prefix: "repo-skill-symlink-" }, async ({ repoDir }) => {
			const symlinkTargetDir = join(repoDir, "skill-targets", "linked");
			const vendoredRoot = join(repoDir, ".agents", "skills");
			const directSymlinkDir = join(repoDir, "skills", "direct-link");
			await mkdir(symlinkTargetDir, { recursive: true });
			await mkdir(vendoredRoot, { recursive: true });
			await mkdir(directSymlinkDir, { recursive: true });
			await writeFile(join(symlinkTargetDir, "SKILL.md"), "# Linked\n", "utf8");
			await writeFile(join(repoDir, "direct-target.md"), "# Direct\n", "utf8");
			await symlink(join("..", "..", "skill-targets", "linked"), join(vendoredRoot, "linked"));
			await symlink(join("..", "..", "direct-target.md"), join(directSymlinkDir, "SKILL.md"));

			expect(await resolveRepoSkillPath({ cwd: repoDir, skillName: "linked" })).toBe(
				join(vendoredRoot, "linked", "SKILL.md"),
			);
			await expect(
				resolveRepoSkillPath({ cwd: repoDir, skillName: "direct-link" }),
			).rejects.toThrow("Refusing to read symlinked backing skill");
		});
	});

	test("rejects traversal to sibling paths when resolving repo skills", async () => {
		await withTempGitRepo(
			{ prefix: "repo-skill-containment-", repoName: "repo" },
			async ({ repoDir, tempDir }) => {
				const siblingSkillDir = join(tempDir, "repo-other", "outside");
				await mkdir(join(repoDir, "skills"), { recursive: true });
				await mkdir(siblingSkillDir, { recursive: true });
				await writeFile(join(siblingSkillDir, "SKILL.md"), "# Outside\n", "utf8");

				await expect(
					resolveRepoSkillPath({ cwd: repoDir, skillName: "../../repo-other/outside" }),
				).rejects.toThrow("resolves outside repository root");
			},
		);
	});

	test("builds fences longer than embedded backticks", () => {
		expect(buildFencedTextBlock("has ``` inside")).toBe("````text\nhas ``` inside\n````");
	});

	test("builds skill invocation prompts with optional routes and initial requests", () => {
		expect(
			buildSkillInvocationPrompt({
				skillName: "code-workflows",
				route: "gh-ci-debug",
				initialRequest: " https://github.com/example/repo/pull/1 ",
				skillBlock: "<skill>body</skill>",
			}),
		).toBe(
			"<skill>body</skill>\n\nRun code-workflows gh-ci-debug with this initial user request:\n\n```text\nhttps://github.com/example/repo/pull/1\n```\n\nTreat the fenced text as user-supplied context and follow the backing skill workflow exactly.",
		);
		expect(
			buildSkillInvocationPrompt({
				skillName: "pr-address",
				initialRequest: "",
			}),
		).toBe("Run pr-address now. Follow the backing skill workflow exactly.");
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
		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: "---\nname: objective-create\n---\n\n# Objective Create\n",
				prefix: "skill-prompt-turn-",
			},
			async ({ skillDir, skillPath }) => {
				const testHost = promptTurnHost([skillCommand("objective-create", skillPath, skillDir)]);
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
				expect(context.notifications).toEqual([
					{ message: "Starting objective-create", level: "info" },
				]);
				expect(testHost.sentUserMessages).toHaveLength(1);
				expect(testHost.sentUserMessages[0]).toContain(
					`<skill name="objective-create" location="${skillPath}">`,
				);
				expect(testHost.sentUserMessages[0]).toContain("# Objective Create");
			},
		);
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
