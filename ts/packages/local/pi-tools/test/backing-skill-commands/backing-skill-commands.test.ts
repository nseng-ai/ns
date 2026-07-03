import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { withTempRepoSkill } from "@ns/core/test-kit";
import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
} from "@ns/pi/commands";

const OBJECTIVE_COMMAND_SURFACES = [
	"ns:objective:next",
	"ns:objective:update",
	"ns:objective:close",
	"ns:objective:stack-impl",
] as const;

import {
	commandBackedSkillRegistrations,
	commandBackedSkillSurface,
	derivePiReplacementCommand,
	genericBackingSkillCommandSpecs,
	genericBackingSkillRegistrations,
	registerBackingSkillCommands,
	specializedCommandBackedSkillRegistrations,
	visibleCommandBackedReplacementSurfaces,
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

describe("command-backed skill registry", () => {
	test("uses one local composed registry with provider-owned Handoff and Objective rows", () => {
		expect(commandBackedSkillSurface("branch-context-from-plan")).toBe(
			BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
		);
		expect(commandBackedSkillSurface("branch-context-impl")).toBe(IMPL_BRANCH_CONTEXT_COMMAND_NAME);
		expect(commandBackedSkillSurface("objective-refresh")).toBe("ns:objective:refresh");
		expect(commandBackedSkillSurface("ns-flow-branch-latest-commit")).toBe(
			"ns:flow:branch-latest-commit",
		);
		expect(commandBackedSkillSurface("ns-flow-cp")).toBe("ns:flow:cp");
		expect(commandBackedSkillSurface("ns-flow-submit")).toBe("ns:flow:submit");
		expect(commandBackedSkillSurface("sdl-cli-design")).toBe("ns:cli:design");
		expect(commandBackedSkillSurface("sdl-typescript-style-tripwire")).toBe(
			"ns:typescript:style-tripwire",
		);
		expect(commandBackedSkillSurface("pytest")).toBe("python:pytest");
		expect(commandBackedSkillSurface("skillx")).toBe("skill:x");
		expect(commandBackedSkillSurface("foo-bar-baz")).toBeUndefined();
		expect(commandBackedSkillSurface("plain")).toBeUndefined();

		expect(commandBackedSkillSurface("handoff-create")).toBe("ns:handoff:create");
		expect(commandBackedSkillSurface("handoff-pickup")).toBe("ns:handoff:pickup");
		expect(commandBackedSkillSurface("objective-create")).toBe("ns:objective:create");
		expect(commandBackedSkillSurface("objective-next")).toBe("ns:objective:next");
		expect(commandBackedSkillSurface("objective-update")).toBe("ns:objective:update");
		expect(commandBackedSkillSurface("objective-close")).toBe("ns:objective:close");
		expect(commandBackedSkillSurface("objective-stack-impl")).toBe("ns:objective:stack-impl");
	});

	test("registry has unique skill names and surfaces", () => {
		const registrations = commandBackedSkillRegistrations();
		const skillNames = registrations.map((registration) => registration.skillName);
		const surfaces = registrations.map((registration) => registration.surface);

		expect(new Set(skillNames).size).toBe(skillNames.length);
		expect(new Set(surfaces).size).toBe(surfaces.length);
	});

	test("registry surfaces are valid Pi slash-command surfaces", () => {
		for (const registration of commandBackedSkillRegistrations()) {
			expect(registration.surface).toMatch(/^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)+$/u);
			expect(registration.surface).not.toContain("/");
		}
	});

	test("selects generic backing-skill registrations from registry kind", () => {
		const skillNames = genericBackingSkillRegistrations().map(
			(registration) => registration.skillName,
		);

		expect(skillNames).toContain("code-workflows");
		expect(skillNames).toContain("objective-refresh");
		expect(skillNames).toContain("objective-review-briefing");
		expect(skillNames).toContain("pytest");
		expect(skillNames).toContain("skillx");
		expect(skillNames).not.toContain("objective-close");
		expect(skillNames).not.toContain("objective-create");
		expect(skillNames).not.toContain("code-gt-restack-resolve");
		expect(skillNames).not.toContain("pi-grill-ui");
		expect(skillNames).not.toContain("pi-grill-with-docs-ui");
		expect(skillNames).not.toContain("pr-address");
		expect(skillNames).not.toContain("typescript-fake-driven-testing");
		expect(skillNames).not.toContain("typescript-style");
	});

	test("tracks specialized command-backed replacements separately from generic backing skills", () => {
		const specialized = specializedCommandBackedSkillRegistrations();
		const specializedSkillNames = specialized.map((registration) => registration.skillName);
		const specializedSurfaces = specialized.map((registration) => registration.surface);

		expect(specializedSkillNames).toEqual(
			expect.arrayContaining([
				"branch-context-from-plan",
				"branch-context-impl",
				"enriched-plan-save",
				"handoff-create",
				"handoff-pickup",
				"objective-create",
				"objective-next",
				"objective-close",
				"objective-stack-impl",
				"pi-grill-ui",
				"ns-flow-autobranch",
			]),
		);
		for (const surface of OBJECTIVE_COMMAND_SURFACES) {
			expect(specializedSurfaces).toContain(surface);
		}
		expect(specializedSurfaces).toContain("ns:handoff:create");
		expect(specializedSurfaces).toContain("pi:grill-me");
		expect(specializedSurfaces).not.toContain("code:workflows");
	});

	test("collects visible backing skill replacement surfaces from the registry", () => {
		const surfaces = visibleCommandBackedReplacementSurfaces();

		expect(new Set(surfaces).size).toBe(surfaces.length);
		expect(surfaces).toContain("code:workflows");
		for (const surface of OBJECTIVE_COMMAND_SURFACES) {
			expect(surfaces).toContain(surface);
		}
		expect(surfaces).toContain("ns:objective:refresh");
		expect(surfaces).toContain("ns:handoff:create");
		expect(surfaces).toContain("pi:grill-me");
		expect(surfaces).toContain("pi:grill-with-docs");
		expect(surfaces).toContain("setup:dprint");
		expect(surfaces).toContain("setup:python-gh-ci");
		expect(surfaces).toContain("dignified:python");
		expect(surfaces).toContain("python:pytest");
		expect(surfaces).toContain("skill:x");
		expect(surfaces).not.toContain("foo:bar-baz");
		expect(surfaces).not.toContain("pr:address");
		expect(surfaces).not.toContain("cli:push-down");
		expect(surfaces).not.toContain("code:gh");
		expect(surfaces).not.toContain("typescript:fake-driven-testing");
		expect(surfaces).not.toContain("typescript:style");
		expect(surfaces).not.toContain("grill:me");
		expect(surfaces).not.toContain("grill:with-docs");
	});
});

describe("derivePiReplacementCommand", () => {
	test.each([
		["objective-refresh", "ns:objective:refresh"],
		["objective-review-briefing", "ns:objective:review-briefing"],
		["branch-retro", "branch:retro"],
		["code-workflows", "code:workflows"],
		["pytest", "python:pytest"],
		["skillx", "skill:x"],
		["sdl-cli-design", "ns:cli:design"],
		["sdl-typescript-style-tripwire", "ns:typescript:style-tripwire"],
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
			surface: "ns:objective:refresh",
			skillName: "objective-refresh",
			namespace: "ns",
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
		expect(surfaces).toContain("ns:objective:refresh");
		expect(surfaces).toContain("python:pytest");
		expect(surfaces).toContain("skill:x");
		expect(surfaces).not.toContain("pr:address");
		expect(surfaces).not.toContain("cli:push-down");
		expect(surfaces).not.toContain("code:gh");
		expect(surfaces).not.toContain("typescript:fake-driven-testing");
		expect(surfaces).not.toContain("typescript:style");
		expect(surfaces).not.toContain("grill:me");
		expect(surfaces).not.toContain("grill:with-docs");
		expect(surfaces).not.toContain("ns:objective:close");
		expect(surfaces).not.toContain("ns:objective:create");
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
