import { describe, expect, test } from "vitest";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { withTempGitRepo, withTempRepoSkill } from "@nseng-ai/foundation/test-kit";

import {
	buildSkillInvocationPrompt,
	captureRequiredEffectiveSkill,
	expandRepoSkillBlock,
	expandSkillBlockFromPath,
	invokeEffectiveSkillPromptTurn,
	invokeRepoSkillPromptTurn,
	requireRepoSkillBlock,
	requireRepoSkillPath,
	resolveRepoSkillPath,
} from "../src/kit/skills/expansion.ts";

function promptTurnHost(): {
	sentUserMessages: string[];
	sendUserMessage(content: string): void;
} {
	const sentUserMessages: string[] = [];
	return {
		sentUserMessages,
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

describe("repo skill expansion", () => {
	test("walks up from cwd and expands flat .agents/skills/<name>/SKILL.md", async () => {
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

	test("uses shared skill lookup precedence across flat agents and Claude roots", async () => {
		await withTempGitRepo({ prefix: "repo-skill-precedence-" }, async ({ repoDir }) => {
			const nestedCwd = join(repoDir, "packages", "example");
			await mkdir(nestedCwd, { recursive: true });
			for (const root of [join(".agents", "skills"), join(".claude", "skills")]) {
				const skillDir = join(repoDir, root, "shared");
				await mkdir(skillDir, { recursive: true });
				await writeFile(join(skillDir, "SKILL.md"), `# ${root}\n`, "utf8");
			}

			expect(await resolveRepoSkillPath({ cwd: nestedCwd, skillName: "shared" })).toBe(
				join(repoDir, ".agents", "skills", "shared", "SKILL.md"),
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
				).rejects.toThrow(
					"Could not find .agents/skills/parent-only/SKILL.md, .claude/skills/parent-only/SKILL.md",
				);
			},
		);
	});

	test("allows symlinked skill directories but rejects directly symlinked SKILL.md files", async () => {
		await withTempGitRepo({ prefix: "repo-skill-symlink-" }, async ({ repoDir }) => {
			const symlinkTargetDir = join(repoDir, "skill-targets", "linked");
			const vendoredRoot = join(repoDir, ".agents", "skills");
			const directSymlinkDir = join(repoDir, ".claude", "skills", "direct-link");
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
				await mkdir(join(repoDir, ".agents", "skills"), { recursive: true });
				await mkdir(siblingSkillDir, { recursive: true });
				await writeFile(join(siblingSkillDir, "SKILL.md"), "# Outside\n", "utf8");

				await expect(
					resolveRepoSkillPath({ cwd: repoDir, skillName: "../../../../repo-other/outside" }),
				).rejects.toThrow("resolves outside repository root");
			},
		);
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
				skillBlock: "<skill>address body</skill>",
			}),
		).toBe(
			"<skill>address body</skill>\n\nRun pr-address now. Follow the backing skill workflow exactly.",
		);
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

async function captureError(operation: () => Promise<unknown>): Promise<Error> {
	try {
		await operation();
	} catch (error) {
		if (error instanceof Error) return error;
		throw new Error("Expected operation to throw an Error.");
	}
	throw new Error("Expected operation to throw.");
}

describe("required repo skill loading", () => {
	test("preflights the canonical path without reading or parsing content", async () => {
		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: "---\nname: objective-create\n# Missing fence\n",
				prefix: "required-repo-skill-path-",
			},
			async ({ repoDir, skillPath }) => {
				expect(await requireRepoSkillPath({ cwd: repoDir, skillName: "objective-create" })).toBe(
					skillPath,
				);
			},
		);
	});

	test("wraps missing-path preflight with its exact name, lookup detail, and cause", async () => {
		await withTempGitRepo({ prefix: "missing-required-repo-skill-path-" }, async ({ repoDir }) => {
			const thrown = await captureError(() =>
				requireRepoSkillPath({ cwd: repoDir, skillName: "objective-create" }),
			);

			const detail =
				`Could not find .agents/skills/objective-create/SKILL.md, ` +
				`.claude/skills/objective-create/SKILL.md from ${repoDir}.`;
			expect(thrown.message).toBe(`Could not load required skill "objective-create": ${detail}`);
			expect(thrown.cause).toEqual(new Error(detail));
		});
	});

	test("returns the expanded required repo skill", async () => {
		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: "---\nname: objective-create\n---\n\n# Objective Create\n",
				prefix: "required-repo-skill-",
			},
			async ({ repoDir, skillPath }) => {
				const expanded = await requireRepoSkillBlock({
					cwd: repoDir,
					skillName: "objective-create",
				});

				expect(expanded).toMatchObject({
					name: "objective-create",
					path: skillPath,
					body: "# Objective Create",
				});
			},
		);
	});

	test("wraps a missing skill with its exact name, lookup detail, and cause", async () => {
		await withTempGitRepo({ prefix: "missing-required-repo-skill-" }, async ({ repoDir }) => {
			const thrown = await captureError(() =>
				requireRepoSkillBlock({ cwd: repoDir, skillName: "objective-create" }),
			);

			const detail =
				`Could not find .agents/skills/objective-create/SKILL.md, ` +
				`.claude/skills/objective-create/SKILL.md from ${repoDir}.`;
			expect(thrown.message).toBe(`Could not load required skill "objective-create": ${detail}`);
			expect(thrown.cause).toEqual(new Error(detail));
		});
	});

	test("wraps an unreadable skill and preserves the exact Error cause", async () => {
		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: "# Objective Create\n",
				prefix: "unreadable-required-repo-skill-",
			},
			async ({ repoDir }) => {
				const cause = new Error("cannot read repo skill");
				const thrown = await captureError(() =>
					requireRepoSkillBlock({
						cwd: repoDir,
						skillName: "objective-create",
						readTextFile: async () => {
							throw cause;
						},
					}),
				);

				expect(thrown.message).toBe(
					'Could not load required skill "objective-create": cannot read repo skill',
				);
				expect(thrown.cause).toBe(cause);
			},
		);
	});

	test("wraps malformed frontmatter and preserves the parser error as cause", async () => {
		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: "---\nname: objective-create\n# Missing fence\n",
				prefix: "malformed-required-repo-skill-",
			},
			async ({ repoDir }) => {
				const thrown = await captureError(() =>
					requireRepoSkillBlock({ cwd: repoDir, skillName: "objective-create" }),
				);

				expect(thrown.message).toBe(
					'Could not load required skill "objective-create": Skill Markdown frontmatter is missing a closing "---" fence.',
				);
				expect(thrown.cause).toEqual(
					new Error('Skill Markdown frontmatter is missing a closing "---" fence.'),
				);
			},
		);
	});

	test("stringifies and preserves a non-Error cause", async () => {
		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: "# Objective Create\n",
				prefix: "non-error-required-repo-skill-",
			},
			async ({ repoDir }) => {
				const thrown = await captureError(() =>
					requireRepoSkillBlock({
						cwd: repoDir,
						skillName: "objective-create",
						readTextFile: async () => {
							throw "read rejected";
						},
					}),
				);

				expect(thrown.message).toBe(
					'Could not load required skill "objective-create": read rejected',
				);
				expect(thrown.cause).toBe("read rejected");
			},
		);
	});
});

describe("invokeRepoSkillPromptTurn", () => {
	test("fails on repo-local absence without sending a prompt", async () => {
		await withTempGitRepo({ prefix: "missing-repo-prompt-skill-" }, async ({ repoDir }) => {
			const testHost = promptTurnHost();
			const context = promptTurnContext();

			await expect(
				invokeRepoSkillPromptTurn({
					host: testHost,
					ctx: { ...context.ctx, cwd: repoDir },
					skillName: "objective-create",
					successMessage: "unused",
					buildPrompt: (skillBlock) => skillBlock,
				}),
			).rejects.toThrow(
				'Could not load required skill "objective-create": Could not find .agents/skills/objective-create/SKILL.md, .claude/skills/objective-create/SKILL.md',
			);
			expect(testHost.sentUserMessages).toEqual([]);
			expect(context.notifications).toEqual([]);
		});
	});

	test("waits, notifies, and sends the required repo skill prompt", async () => {
		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: "# Objective Create\n",
				prefix: "required-repo-prompt-skill-",
			},
			async ({ repoDir }) => {
				const testHost = promptTurnHost();
				const context = promptTurnContext();

				await invokeRepoSkillPromptTurn({
					host: testHost,
					ctx: { ...context.ctx, cwd: repoDir },
					skillName: "objective-create",
					successMessage: (skill) => `Starting ${skill.name}`,
					buildPrompt: (skillBlock) => `prompt:\n${skillBlock}`,
				});

				expect(context.waits()).toBe(1);
				expect(context.notifications).toEqual([
					{ message: "Starting objective-create", level: "info" },
				]);
				expect(testHost.sentUserMessages).toHaveLength(1);
				expect(testHost.sentUserMessages[0]).toContain("# Objective Create");
			},
		);
	});
});

describe("captureRequiredEffectiveSkill", () => {
	test("captures exact immutable metadata and defers reading until load", async () => {
		const reads: string[] = [];
		const skills = [
			{ name: "objective", filePath: "/user/objective/SKILL.md", baseDir: "/exact/base" },
		];
		const required = captureRequiredEffectiveSkill(
			{ getSystemPromptOptions: () => ({ skills }) },
			"objective",
			{
				readTextFile: async (path) => {
					reads.push(path);
					return "---\nname: objective\n---\nBody";
				},
			},
		);
		skills[0] = { name: "objective", filePath: "/changed/SKILL.md", baseDir: "/changed" };
		expect(reads).toEqual([]);
		expect(required).toMatchObject({
			filePath: "/user/objective/SKILL.md",
			baseDir: "/exact/base",
		});
		expect(Object.isFrozen(required)).toBe(true);
		const expanded = await required.load();
		expect(reads).toEqual(["/user/objective/SKILL.md"]);
		expect(expanded.block).toContain('location="/user/objective/SKILL.md"');
		expect(expanded.block).toContain("References are relative to /exact/base.");
	});

	test.each([
		{
			name: "unreadable content",
			readTextFile: async (): Promise<string> => {
				throw new Error("cannot read effective skill");
			},
			expectedCause: "cannot read effective skill",
		},
		{
			name: "malformed frontmatter",
			readTextFile: async (): Promise<string> => "---\nname: objective\n# Missing fence\n",
			expectedCause: 'Skill Markdown frontmatter is missing a closing "---" fence.',
		},
	])(
		"fails closed for $name without delivering a prompt",
		async ({ readTextFile, expectedCause }) => {
			const testHost = promptTurnHost();
			const context = promptTurnContext();
			const thrown = await captureError(() =>
				invokeEffectiveSkillPromptTurn({
					host: testHost,
					ctx: {
						...context.ctx,
						getSystemPromptOptions: () => ({
							skills: [
								{
									name: "objective",
									filePath: "/effective/objective/SKILL.md",
									baseDir: "/effective/objective",
								},
							],
						}),
					},
					skillName: "objective",
					successMessage: "unused",
					buildPrompt: (skillBlock) => skillBlock,
					readTextFile,
				}),
			);

			expect(thrown.message).toBe(`Could not load required skill "objective": ${expectedCause}`);
			expect(thrown.cause).toEqual(new Error(expectedCause));
			expect(context.waits()).toBe(1);
			expect(context.notifications).toEqual([]);
			expect(testHost.sentUserMessages).toEqual([]);
		},
	);

	test.each([
		undefined,
		[],
		[
			{ name: "objective", filePath: "/one", baseDir: "/one" },
			{ name: "objective", filePath: "/two", baseDir: "/two" },
		],
	])("rejects missing or duplicate exact matches with a cause", (skills) => {
		try {
			captureRequiredEffectiveSkill(
				{ getSystemPromptOptions: () => (skills === undefined ? {} : { skills }) },
				"objective",
			);
			throw new Error("expected capture to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain('Could not load required skill "objective"');
			expect((error as Error).cause).toBeInstanceOf(Error);
		}
	});
});
