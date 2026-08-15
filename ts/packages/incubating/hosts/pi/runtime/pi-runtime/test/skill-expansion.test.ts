import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { withTempGitRepo, withTempRepoSkill } from "@nseng-ai/foundation/test-kit";

import {
	buildSkillInvocationPrompt,
	expandEffectiveSkillBlock,
	expandRepoSkillBlock,
	expandSkillBlockFromPath,
	invokeEffectiveSkillPromptTurn,
	invokeRepoSkillPromptTurn,
	requireEffectiveSkillBlock,
	requireEffectiveSkillSource,
	requireRepoSkillBlock,
	requireRepoSkillPath,
	resolveRepoSkillPath,
	type EffectiveSkillInfo,
} from "../src/kit/skills/expansion.ts";

function effectiveSkill(
	name: string,
	filePath = `/skills/${name}/SKILL.md`,
	baseDir = `/skills/${name}`,
): EffectiveSkillInfo {
	return { name, filePath, baseDir };
}

function effectiveHost(skills?: readonly EffectiveSkillInfo[]): {
	getSystemPromptOptions(): { skills?: readonly EffectiveSkillInfo[] };
} {
	return {
		getSystemPromptOptions() {
			return skills === undefined ? {} : { skills };
		},
	};
}

function promptTurnHarness(skills?: readonly EffectiveSkillInfo[]): {
	host: { sent: string[]; sendUserMessage(content: string): void };
	ctx: {
		hasUI: boolean;
		ui: { notify(message: string, level?: "info" | "warning"): void };
		waitForIdle(): Promise<void>;
		getSystemPromptOptions(): { skills?: readonly EffectiveSkillInfo[] };
	};
	notifications: Array<{ message: string; level: "info" | "warning" | undefined }>;
	waits(): number;
} {
	const sent: string[] = [];
	const notifications: Array<{
		message: string;
		level: "info" | "warning" | undefined;
	}> = [];
	let waitCount = 0;
	return {
		host: {
			sent,
			sendUserMessage(content: string): void {
				sent.push(content);
			},
		},
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
			getSystemPromptOptions() {
				return skills === undefined ? {} : { skills };
			},
		},
		notifications,
		waits: () => waitCount,
	};
}

async function captureError(operation: () => Promise<unknown>): Promise<Error> {
	try {
		await operation();
	} catch (error) {
		if (error instanceof Error) return error;
		throw new Error("Expected operation to throw an Error.");
	}
	throw new Error("Expected operation to throw.");
}

describe("effective skill source resolution", () => {
	test("matches the exact effective skill name and preserves Pi's path and base directory", () => {
		const source = requireEffectiveSkillSource(
			effectiveHost([
				effectiveSkill(
					"objective",
					"/project/.agents/skills/objective/SKILL.md",
					"/project/source",
				),
				effectiveSkill("objective-next"),
			]),
			"objective",
		);

		expect(source).toEqual({
			name: "objective",
			filePath: "/project/.agents/skills/objective/SKILL.md",
			baseDir: "/project/source",
		});
	});

	test("accepts an effective winner outside cwd without containment or symlink policy", () => {
		expect(
			requireEffectiveSkillSource(
				effectiveHost([
					effectiveSkill("global", "/Users/example/.agents/skills/global/link.md", "/external"),
				]),
				"global",
			),
		).toEqual({
			name: "global",
			filePath: "/Users/example/.agents/skills/global/link.md",
			baseDir: "/external",
		});
	});

	test.each([undefined, [] as const])("fails closed when skills are missing or empty", (skills) => {
		let thrown: unknown;
		try {
			requireEffectiveSkillSource(effectiveHost(skills), "objective");
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(Error);
		if (!(thrown instanceof Error)) throw new Error("Expected Error.");
		expect(thrown.message).toBe(
			'Could not load required skill "objective": Pi did not include the skill in its effective skill inventory.',
		);
		expect(thrown.cause).toEqual(
			new Error("Pi did not include the skill in its effective skill inventory."),
		);
	});

	test("rejects duplicate exact names as an invariant failure", () => {
		expect(() =>
			requireEffectiveSkillSource(
				effectiveHost([
					effectiveSkill("objective", "/one", "/a"),
					effectiveSkill("objective", "/two", "/b"),
				]),
				"objective",
			),
		).toThrow(
			'Could not load required skill "objective": Effective skill inventory contains 2 entries named "objective".',
		);
	});
});

describe("effective skill block expansion", () => {
	test("defers reading until expansion and uses the captured source after inventory changes", async () => {
		const first = effectiveSkill("objective", "/winner/SKILL.md", "/winner/base");
		let skills = [first];
		const source = requireEffectiveSkillSource(
			{ getSystemPromptOptions: () => ({ skills }) },
			"objective",
		);
		skills = [effectiveSkill("objective", "/later/SKILL.md", "/later/base")];
		const reads: string[] = [];

		const expanded = await expandEffectiveSkillBlock(source, {
			readTextFile: async (path) => {
				reads.push(path);
				return "---\nname: objective\n---\n\n# Objective\n";
			},
		});

		expect(reads).toEqual(["/winner/SKILL.md"]);
		expect(expanded).toEqual({
			name: "objective",
			commandName: "effective:objective",
			path: "/winner/SKILL.md",
			baseDir: "/winner/base",
			body: "# Objective",
			block: `<skill name="objective" location="/winner/SKILL.md">
References are relative to /winner/base.

# Objective
</skill>`,
		});
	});

	test("retains Markdown without frontmatter and malformed-frontmatter behavior", async () => {
		const source = { name: "objective", filePath: "/skill.md", baseDir: "/" };
		expect(
			(
				await expandEffectiveSkillBlock(source, {
					readTextFile: async () => "\n# Objective\n",
				})
			).body,
		).toBe("# Objective");
		await expect(
			expandEffectiveSkillBlock(source, {
				readTextFile: async () => "---\nname: objective\n# Missing fence\n",
			}),
		).rejects.toThrow('Skill Markdown frontmatter is missing a closing "---" fence.');
	});

	test("required expansion wraps and preserves read failures", async () => {
		const cause = new Error("cannot read winner");
		const thrown = await captureError(() =>
			requireEffectiveSkillBlock(
				{ name: "objective", filePath: "/missing", baseDir: "/" },
				{
					readTextFile: async () => {
						throw cause;
					},
				},
			),
		);
		expect(thrown.message).toBe('Could not load required skill "objective": cannot read winner');
		expect(thrown.cause).toBe(cause);
	});
});

describe("invokeEffectiveSkillPromptTurn", () => {
	test("captures the effective source immediately, then waits, expands, notifies, and sends", async () => {
		const harness = promptTurnHarness([effectiveSkill("objective", "/winner/SKILL.md", "/winner")]);
		await invokeEffectiveSkillPromptTurn({
			host: harness.host,
			ctx: harness.ctx,
			skillName: "objective",
			successMessage: (skill) => `Starting ${skill.name}`,
			buildPrompt: (block) => `prompt:\n${block}`,
			readTextFile: async () => "# Objective",
		});

		expect(harness.waits()).toBe(1);
		expect(harness.notifications).toEqual([{ message: "Starting objective", level: "info" }]);
		expect(harness.host.sent).toEqual([
			`prompt:\n<skill name="objective" location="/winner/SKILL.md">
References are relative to /winner.

# Objective
</skill>`,
		]);
	});

	test("fails before waiting or sending when the effective source is absent", async () => {
		const harness = promptTurnHarness();
		await expect(
			invokeEffectiveSkillPromptTurn({
				host: harness.host,
				ctx: harness.ctx,
				skillName: "objective",
				successMessage: "unused",
				buildPrompt: (block) => block,
			}),
		).rejects.toThrow('Could not load required skill "objective"');
		expect(harness.waits()).toBe(0);
		expect(harness.host.sent).toEqual([]);
	});
});

describe("explicit repository-authority APIs", () => {
	test("walks to the Git root and expands the exact repo skill", async () => {
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
				expect(expanded.path).toBe(skillPath);
				expect(expanded.baseDir).toBe(skillDir);
				expect(expanded.body).toBe("# Objective Create");
			},
		);
	});

	test("keeps repo precedence across agents and Claude roots", async () => {
		await withTempGitRepo({ prefix: "repo-skill-precedence-" }, async ({ repoDir }) => {
			for (const root of [join(".agents", "skills"), join(".claude", "skills")]) {
				const skillDir = join(repoDir, root, "shared");
				await mkdir(skillDir, { recursive: true });
				await writeFile(join(skillDir, "SKILL.md"), `# ${root}\n`, "utf8");
			}
			expect(await resolveRepoSkillPath({ cwd: repoDir, skillName: "shared" })).toBe(
				join(repoDir, ".agents", "skills", "shared", "SKILL.md"),
			);
		});
	});

	test("keeps repo containment and direct-symlink safety", async () => {
		await withTempGitRepo({ prefix: "repo-skill-safety-" }, async ({ repoDir, tempDir }) => {
			const skillDir = join(repoDir, ".agents", "skills", "direct-link");
			await mkdir(skillDir, { recursive: true });
			await writeFile(join(repoDir, "target.md"), "# Direct\n", "utf8");
			await symlink(join("..", "..", "..", "target.md"), join(skillDir, "SKILL.md"));
			await expect(
				resolveRepoSkillPath({ cwd: repoDir, skillName: "direct-link" }),
			).rejects.toThrow("Refusing to read symlinked backing skill");

			const sibling = join(tempDir, "outside", "skill");
			await mkdir(sibling, { recursive: true });
			await writeFile(join(sibling, "SKILL.md"), "# Outside\n", "utf8");
			await expect(
				resolveRepoSkillPath({ cwd: repoDir, skillName: "../../../../outside/skill" }),
			).rejects.toThrow("resolves outside repository root");
		});
	});

	test("preflights without reading and wraps repo lookup failures with cause", async () => {
		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: "---\nname: objective-create\n# Missing fence\n",
				prefix: "repo-skill-preflight-",
			},
			async ({ repoDir, skillPath }) => {
				expect(await requireRepoSkillPath({ cwd: repoDir, skillName: "objective-create" })).toBe(
					skillPath,
				);
			},
		);
		await withTempGitRepo({ prefix: "missing-repo-skill-" }, async ({ repoDir }) => {
			const thrown = await captureError(() =>
				requireRepoSkillBlock({ cwd: repoDir, skillName: "objective-create" }),
			);
			expect(thrown.message).toContain('Could not load required skill "objective-create"');
			expect(thrown.cause).toBeInstanceOf(Error);
		});
	});

	test("loads a captured repo path and invokes a repo-authority prompt turn", async () => {
		const expanded = await expandSkillBlockFromPath({
			skillName: "objective-create",
			skillPath: "/repo/skills/objective-create/SKILL.md",
			readTextFile: async () => "# Objective Create",
		});
		expect(expanded.commandName).toBe("direct:objective-create");

		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: "# Objective Create\n",
				prefix: "repo-prompt-turn-",
			},
			async ({ repoDir }) => {
				const harness = promptTurnHarness();
				await invokeRepoSkillPromptTurn({
					host: harness.host,
					ctx: { ...harness.ctx, cwd: repoDir },
					skillName: "objective-create",
					successMessage: "Starting repo skill",
					buildPrompt: (block) => block,
				});
				expect(harness.waits()).toBe(1);
				expect(harness.host.sent[0]).toContain("# Objective Create");
			},
		);
	});
});

describe("buildSkillInvocationPrompt", () => {
	test("includes optional routes and fences initial user context", () => {
		expect(
			buildSkillInvocationPrompt({
				skillName: "code-workflows",
				route: "gh-ci-debug",
				initialRequest: " https://github.com/example/repo/pull/1 ",
				skillBlock: "<skill>body</skill>",
			}),
		).toContain("Run code-workflows gh-ci-debug with this initial user request:\n\n```text");
	});
});
