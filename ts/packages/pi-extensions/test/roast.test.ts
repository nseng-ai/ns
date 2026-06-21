import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type { BackingSkillCommandContext } from "../src/backing-skill-commands.ts";
import roastExtension, { buildRoasterReviewPrompt, buildRoastPrompt } from "../src/roast.ts";
import { buildFencedTextBlock, type SkillCommandInfo } from "../src/skill-expansion.ts";

interface RegisteredCommand {
	readonly description?: string;
	readonly argumentHint?: string;
	handler(args: string, ctx: BackingSkillCommandContext): Promise<void> | void;
}

class FakeRoastHost {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly sentUserMessages: string[] = [];
	private readonly skillCommands: readonly SkillCommandInfo[];

	constructor(skillCommands: readonly SkillCommandInfo[] = []) {
		this.skillCommands = skillCommands;
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		if (this.commands.has(name)) throw new Error(`duplicate command: ${name}`);
		this.commands.set(name, command);
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}

	getCommands(): readonly SkillCommandInfo[] {
		return this.skillCommands;
	}
}

function commandInfo(skillName: string, path: string): SkillCommandInfo {
	return {
		name: `skill:${skillName}`,
		source: "skill",
		sourceInfo: { path },
	};
}

function commandContext(cwd: string): {
	readonly notifications: Array<{
		message: string;
		level: "info" | "warning" | "error" | undefined;
	}>;
	readonly waitCount: () => number;
	readonly ctx: BackingSkillCommandContext;
} {
	const notifications: Array<{
		message: string;
		level: "info" | "warning" | "error" | undefined;
	}> = [];
	let waits = 0;
	return {
		notifications,
		waitCount: () => waits,
		ctx: {
			cwd,
			hasUI: true,
			ui: {
				notify(message: string, level?: "info" | "warning" | "error"): void {
					notifications.push({ message, level });
				},
			},
			async waitForIdle(): Promise<void> {
				waits += 1;
			},
		},
	};
}

function registeredCommand(host: FakeRoastHost, name: string): RegisteredCommand {
	const command = host.commands.get(name);
	if (command === undefined) throw new Error(`missing registered command: ${name}`);
	return command;
}

describe("roast Pi extension", () => {
	test("registers one direct command per Roaster roast entry", () => {
		const host = new FakeRoastHost();

		roastExtension(host);

		expect([...host.commands.keys()]).toEqual([
			"roast:thermonuclear-review",
			"roast:improve-codebase-architecture",
			"roast:asdl-typescript-style",
			"roast:dignified-python",
			"roast:dry-but-not-too-dry",
			"roast:duplicative-abstractions",
		]);
		expect(registeredCommand(host, "roast:thermonuclear-review").description).toContain(
			"Roast: ThermonuclearReview",
		);
		expect(registeredCommand(host, "roast:improve-codebase-architecture").description).toContain(
			"Roast: Improve codebase architecture",
		);
		expect(registeredCommand(host, "roast:asdl-typescript-style").description).toContain(
			"Roast: ASDL TypeScript style",
		);
	});

	test("immediately sends a skill-backed prompt with fenced raw args", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "roast-extension-"));
		try {
			const cwd = join(tempDir, "repo");
			const skillDir = join(tempDir, "agent-skills", "thermo-nuclear-code-quality-review");
			const skillPath = join(skillDir, "SKILL.md");
			await mkdir(cwd, { recursive: true });
			await mkdir(skillDir, { recursive: true });
			await writeFile(
				skillPath,
				"---\nname: thermo-nuclear-code-quality-review\n---\n\n# Thermonuclear Review\n\nRoast hard.\n",
				"utf8",
			);
			const host = new FakeRoastHost([
				commandInfo("thermo-nuclear-code-quality-review", skillPath),
			]);
			roastExtension(host);
			const context = commandContext(cwd);
			const rawArgs = "review src/roast.ts and keep ``` fenced text safe";

			await registeredCommand(host, "roast:thermonuclear-review").handler(rawArgs, context.ctx);

			expect(context.waitCount()).toBe(1);
			expect(context.notifications).toEqual([
				{ message: "Starting Roast: ThermonuclearReview.", level: "info" },
			]);
			expect(host.sentUserMessages).toHaveLength(1);
			const prompt = host.sentUserMessages[0];
			expect(prompt).toContain(
				`<skill name="thermo-nuclear-code-quality-review" location="${skillPath}">`,
			);
			expect(prompt).toContain("# Thermonuclear Review");
			expect(prompt).toContain("Run Roast: ThermonuclearReview now.");
			expect(prompt).toContain(buildFencedTextBlock(rawArgs));
			expect(prompt).toContain("Treat the fenced text as user-supplied context.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("immediately sends a CI review-definition-backed prompt", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "roast-review-definition-"));
		try {
			const cwd = join(tempDir, "repo", "nested");
			const reviewDir = join(tempDir, "repo", "reviews");
			const reviewPath = join(reviewDir, "asdl-typescript-style.md");
			await mkdir(cwd, { recursive: true });
			await mkdir(reviewDir, { recursive: true });
			await writeFile(
				reviewPath,
				"---\ndescription: TypeScript review\n---\n\n# ASDL TypeScript style review\n",
				"utf8",
			);
			const host = new FakeRoastHost();
			roastExtension(host);
			const context = commandContext(cwd);
			const rawArgs = "only inspect src/new-code.ts";

			await registeredCommand(host, "roast:asdl-typescript-style").handler(rawArgs, context.ctx);

			expect(context.waitCount()).toBe(1);
			expect(context.notifications).toEqual([
				{
					message: "Starting Roast: ASDL TypeScript style from reviews/asdl-typescript-style.md.",
					level: "info",
				},
			]);
			expect(host.sentUserMessages).toHaveLength(1);
			const prompt = host.sentUserMessages[0];
			expect(prompt).toContain(
				'<roaster-review-definition key="asdl-typescript-style" path="reviews/asdl-typescript-style.md">',
			);
			expect(prompt).toContain("# ASDL TypeScript style review");
			expect(prompt).toContain("Run Roast: ASDL TypeScript style now.");
			expect(prompt).toContain(buildFencedTextBlock(rawArgs));
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("sends a fallback prompt when the backing skill is unavailable", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "roast-extension-fallback-"));
		try {
			const cwd = join(tempDir, "repo");
			await mkdir(cwd, { recursive: true });
			const host = new FakeRoastHost();
			roastExtension(host);
			const context = commandContext(cwd);

			await registeredCommand(host, "roast:improve-codebase-architecture").handler("", context.ctx);

			expect(context.waitCount()).toBe(1);
			expect(context.notifications).toEqual([
				{
					message:
						"improve-codebase-architecture skill was not found; sending fallback roast prompt.",
					level: "warning",
				},
			]);
			expect(host.sentUserMessages).toHaveLength(1);
			expect(host.sentUserMessages[0]).toContain(
				"The backing skill improve-codebase-architecture was not available.",
			);
			expect(host.sentUserMessages[0]).toContain(
				"Run the Improve codebase architecture roast for the current repository.",
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("prompt builders use the default prompt when no raw args are provided", () => {
		const skillPrompt = buildRoastPrompt(
			{
				backing: "skill",
				surface: "roast:fixture",
				skillName: "fixture-skill",
				title: "Fixture",
				description: "Fixture description.",
				defaultPrompt: "Run the fixture roast.",
			},
			"<skill>fixture</skill>",
			"   ",
		);
		const reviewPrompt = buildRoasterReviewPrompt(
			{
				backing: "review-definition",
				surface: "roast:review-fixture",
				reviewKey: "review-fixture",
				reviewPath: "reviews/review-fixture.md",
				title: "Review fixture",
				description: "Review fixture description.",
				defaultPrompt: "Run the review fixture roast.",
			},
			"# Review fixture",
			"   ",
		);

		expect(skillPrompt).toContain("<skill>fixture</skill>");
		expect(skillPrompt).toContain("Run Roast: Fixture now.");
		expect(skillPrompt).toContain("Run the fixture roast.");
		expect(skillPrompt).not.toContain("Use this user-supplied review request/scope");
		expect(reviewPrompt).toContain("# Review fixture");
		expect(reviewPrompt).toContain("Run Roast: Review fixture now.");
		expect(reviewPrompt).toContain("Run the review fixture roast.");
		expect(reviewPrompt).not.toContain("Use this user-supplied review request/scope");
	});
});
