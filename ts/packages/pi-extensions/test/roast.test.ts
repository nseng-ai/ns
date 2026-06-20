import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import roastExtension, { buildRoastPrompt, type RoastCommandContext } from "../src/roast.ts";
import { buildFencedTextBlock, type SkillCommandInfo } from "../src/skill-expansion.ts";

interface RegisteredCommand {
	readonly description?: string;
	readonly argumentHint?: string;
	handler(args: string, ctx: RoastCommandContext): Promise<void> | void;
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
	readonly ctx: RoastCommandContext;
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
	test("registers one direct command per Roaster roast skill", () => {
		const host = new FakeRoastHost();

		roastExtension(host);

		expect([...host.commands.keys()]).toEqual([
			"roast:thermonuclear-review",
			"roast:improve-codebase-architecture",
		]);
		expect(registeredCommand(host, "roast:thermonuclear-review").description).toContain(
			"Roast: ThermonuclearReview",
		);
		expect(registeredCommand(host, "roast:improve-codebase-architecture").description).toContain(
			"Roast: Improve codebase architecture",
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

	test("prompt builder uses the default prompt when no raw args are provided", () => {
		const prompt = buildRoastPrompt(
			{
				surface: "roast:fixture",
				skillName: "fixture-skill",
				title: "Fixture",
				description: "Fixture description.",
				defaultPrompt: "Run the fixture roast.",
			},
			"<skill>fixture</skill>",
			"   ",
		);

		expect(prompt).toContain("<skill>fixture</skill>");
		expect(prompt).toContain("Run Roast: Fixture now.");
		expect(prompt).toContain("Run the fixture roast.");
		expect(prompt).not.toContain("Use this user-supplied review request/scope");
	});
});
