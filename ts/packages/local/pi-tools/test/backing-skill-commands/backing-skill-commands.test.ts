import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { withTempRepoSkill } from "@ji/core/test-kit";
import { genericBackingSkillRegistrations } from "@ji/pi/commands";

import {
	derivePiReplacementCommand,
	genericBackingSkillCommandSpecs,
	registerBackingSkillCommands,
	specializedCommandBackedSkillRegistrations,
	type BackingSkillCommandContext,
} from "../../src/backing-skill-commands/extension.ts";

type RegisteredCommand = Parameters<typeof registerCommand>[1];

function registerCommand(
	_name: string,
	_command: { handler(args: string, ctx: BackingSkillCommandContext): Promise<void> | void },
): void {}

class FakeBackingSkillHost {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly sentMessages: string[] = [];

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	sendUserMessage(content: string): void {
		this.sentMessages.push(content);
	}
}

function commandContext(cwd: string): BackingSkillCommandContext & {
	notifications: Array<{ message: string; level: string | undefined }>;
} {
	const notifications: Array<{ message: string; level: string | undefined }> = [];
	return {
		cwd,
		hasUI: true,
		notifications,
		ui: {
			notify(message: string, level?: "info" | "warning" | "error"): void {
				notifications.push({ message, level });
			},
		},
		async waitForIdle(): Promise<void> {},
	};
}

describe("derivePiReplacementCommand", () => {
	test.each([
		["objective-refresh", "ji:objective:refresh"],
		["objective-review-briefing", "ji:objective:review-briefing"],
		["branch-retro", "branch:retro"],
		["code-workflows", "code:workflows"],
		["pytest", "python:pytest"],
		["skillx", "skill:x"],
		["sdl-cli-design", "ji:cli:design"],
		["sdl-typescript-style-tripwire", "ji:typescript:style-tripwire"],
	])("derives generic backing skill %s as /%s", (skillName, surface) => {
		expect(derivePiReplacementCommand(skillName)?.surface).toBe(surface);
	});

	test("parses generic command metadata from the explicit command surface", () => {
		expect(derivePiReplacementCommand("code-workflows")).toEqual({
			surface: "code:workflows",
			skillName: "code-workflows",
			namespace: "code",
			command: "workflows",
		});
		expect(derivePiReplacementCommand("objective-refresh")).toEqual({
			surface: "ji:objective:refresh",
			skillName: "objective-refresh",
			namespace: "ji",
			command: "objective:refresh",
		});
	});

	test("does not derive specialized or unknown command metadata", () => {
		expect(derivePiReplacementCommand("objective-create")).toBeUndefined();
		expect(derivePiReplacementCommand("branch-context-from-plan")).toBeUndefined();
		expect(derivePiReplacementCommand("foo-bar-baz")).toBeUndefined();
	});
});

describe("genericBackingSkillCommandSpecs", () => {
	test("keeps generic backing skill rows and skips specialized command rows", () => {
		const specs = genericBackingSkillCommandSpecs();
		const surfaces = specs.map((spec) => spec.surface);
		const specializedSurfaces = new Set(
			specializedCommandBackedSkillRegistrations().map((registration) => registration.surface),
		);

		expect(surfaces).toContain("code:workflows");
		expect(surfaces).toContain("ji:objective:refresh");
		expect(surfaces).toContain("python:pytest");
		expect(surfaces).toContain("skill:x");
		expect(surfaces).not.toContain("pr:address");
		expect(surfaces).not.toContain("cli:push-down");
		expect(surfaces).not.toContain("code:gh");
		expect(surfaces).not.toContain("typescript:fake-driven-testing");
		expect(surfaces).not.toContain("typescript:style");
		expect(surfaces).not.toContain("grill:me");
		expect(surfaces).not.toContain("grill:with-docs");
		expect(surfaces).not.toContain("ji:objective:close");
		expect(surfaces).not.toContain("ji:objective:create");
		expect(surfaces).not.toContain("objective:current");
		expect(surfaces).not.toContain("code:gt-restack-resolve");
		expect(specs.map((spec) => spec.skillName)).toEqual(
			genericBackingSkillRegistrations().map((registration) => registration.skillName),
		);
		for (const surface of surfaces) {
			expect(specializedSurfaces.has(surface)).toBe(false);
		}
	});
});

describe("registerBackingSkillCommands", () => {
	test("registers generic commands that read repo-local backing skills", async () => {
		await withTempRepoSkill(
			{
				skillName: "code-workflows",
				markdown: "---\nname: code-workflows\n---\n\n# Code Workflows\n",
				prefix: "backing-skill-command-",
			},
			async ({ repoDir, skillPath }) => {
				const host = new FakeBackingSkillHost();
				registerBackingSkillCommands(host);
				const command = host.commands.get("code:workflows");
				expect(command).toBeDefined();

				await command?.handler("fix ```this``` please", commandContext(repoDir));

				expect(host.sentMessages).toHaveLength(1);
				expect(host.sentMessages[0]).toContain(
					`<skill name="code-workflows" location="${skillPath}">`,
				);
				expect(host.sentMessages[0]).toContain("# Code Workflows");
				expect(host.sentMessages[0]).toContain("````text\nfix ```this``` please\n````");
			},
		);
	});

	test("generic commands can read vendored backing skills from .agents/skills", async () => {
		await withTempRepoSkill(
			{
				skillName: "improve-codebase-architecture",
				markdown:
					"---\nname: improve-codebase-architecture\n---\n\n# Improve Codebase Architecture\n",
				prefix: "vendored-backing-skill-command-",
				skillRoot: join(".agents", "skills"),
			},
			async ({ repoDir, skillPath }) => {
				const host = new FakeBackingSkillHost();
				registerBackingSkillCommands(host);
				const command = host.commands.get("improve:codebase-architecture");
				expect(command).toBeDefined();

				await command?.handler("", commandContext(repoDir));

				expect(host.sentMessages).toHaveLength(1);
				expect(host.sentMessages[0]).toContain(
					`<skill name="improve-codebase-architecture" location="${skillPath}">`,
				);
				expect(host.sentMessages[0]).toContain("# Improve Codebase Architecture");
			},
		);
	});
});
