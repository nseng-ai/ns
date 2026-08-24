import { describe, expect, test } from "vitest";

import { withTempGitRepo, withTempRepoSkill } from "@nseng-ai/foundation/test-kit";
import type { EffectiveSkillInfo } from "@nseng-ai/pi-runtime/runtime/types";
const BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME = "ns:branch-context:from-plan";
const IMPL_BRANCH_CONTEXT_COMMAND_NAME = "ns:branch-context:impl-attached-plan";

const OBJECTIVE_COMMAND_SURFACES = [
	"ns:objective:next",
	"ns:objective:update",
	"ns:objective:close",
	"ns:objective:autorun",
] as const;

import {
	derivePiReplacementCommand,
	genericSkillBackedCommandSpecs,
	genericBackingSkillRegistrations,
	registerSkillBackedCommands,
	skillBackedCommandRegistrations,
	skillBackedCommandSurface,
	specializedSkillBackedCommandRegistrations,
	visibleSkillBackedCommandSurfaces,
	type SkillBackedCommandContext,
} from "../../src/skill-backed-commands/extension.ts";

type RegisteredCommand = Parameters<typeof registerCommand>[1];

function registerCommand(
	_name: string,
	_command: { handler(args: string, ctx: SkillBackedCommandContext): Promise<void> | void },
): void {}

class FakeSkillBackedCommandHost {
	readonly ackMessages: Array<{ customType: string; content: unknown; display: boolean }> = [];
	readonly commands = new Map<string, RegisteredCommand>();
	readonly sentMessages: string[] = [];

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	sendMessage(message: { customType: string; content: unknown; display: boolean }): void {
		this.ackMessages.push(message);
	}

	sendUserMessage(content: string): void {
		this.sentMessages.push(content);
	}
}

function commandContext(skill?: EffectiveSkillInfo): SkillBackedCommandContext & {
	notifications: Array<{ message: string; level: string | undefined }>;
} {
	const notifications: Array<{ message: string; level: string | undefined }> = [];
	return {
		hasUI: true,
		getSystemPromptOptions: () => ({ skills: skill === undefined ? [] : [skill] }),
		notifications,
		ui: {
			notify(message: string, level?: "info" | "warning" | "error"): void {
				notifications.push({ message, level });
			},
		},
		async waitForIdle(): Promise<void> {},
	};
}

describe("skill-backed command registry", () => {
	test("uses one local composed registry with provider-owned Handoff and Objective rows", () => {
		expect(skillBackedCommandSurface("branch-context-from-plan")).toBe(
			BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
		);
		expect(skillBackedCommandSurface("branch-context-impl")).toBe(IMPL_BRANCH_CONTEXT_COMMAND_NAME);
		expect(skillBackedCommandSurface("objective-refresh")).toBe("ns:objective:refresh");
		expect(skillBackedCommandSurface("ns-flow-gt-branch-latest-commit")).toBe(
			"ns:flow:gt:branch-latest-commit",
		);
		expect(skillBackedCommandSurface("ns-flow-cp")).toBe("ns:flow:cp");
		expect(skillBackedCommandSurface("ns-flow-submit")).toBe("ns:flow:gt:submit");
		expect(skillBackedCommandSurface("ns-flow-gs-autobranch")).toBe("ns:flow:gs:autobranch");
		expect(skillBackedCommandSurface("ns-flow-gs-autoslot")).toBe("ns:flow:gs:autoslot");
		expect(skillBackedCommandSurface("ns-cli-design")).toBe("ns:cli:design");
		expect(skillBackedCommandSurface("ns-typescript-style-tripwire")).toBe(
			"ns:typescript:style-tripwire",
		);
		expect(skillBackedCommandSurface("unregistered-skill-name")).toBeUndefined();
		expect(skillBackedCommandSurface("foo-bar-baz")).toBeUndefined();
		expect(skillBackedCommandSurface("plain")).toBeUndefined();

		expect(skillBackedCommandSurface("handoff-create")).toBe("ns:handoff:create");
		expect(skillBackedCommandSurface("handoff-pickup")).toBe("ns:handoff:pickup");
		expect(skillBackedCommandSurface("objective-create")).toBe("ns:objective:create");
		expect(skillBackedCommandSurface("objective-next")).toBe("ns:objective:next");
		expect(skillBackedCommandSurface("objective-update")).toBe("ns:objective:update");
		expect(skillBackedCommandSurface("objective-close")).toBe("ns:objective:close");
		expect(skillBackedCommandSurface("objective-autorun")).toBe("ns:objective:autorun");
	});

	test("registry has unique skill names and surfaces", () => {
		const registrations = skillBackedCommandRegistrations();
		const skillNames = registrations.map((registration) => registration.skillName);
		const surfaces = registrations.map((registration) => registration.surface);

		expect(new Set(skillNames).size).toBe(skillNames.length);
		expect(new Set(surfaces).size).toBe(surfaces.length);
	});

	test("registry surfaces are valid Pi slash-command surfaces", () => {
		for (const registration of skillBackedCommandRegistrations()) {
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
		expect(skillNames).toContain("ns-flow-gs-autobranch");
		expect(skillNames).toContain("ns-flow-gs-autoslot");
		expect(skillNames).not.toContain("unregistered-skill-name");
		expect(skillNames).not.toContain("objective-close");
		expect(skillNames).not.toContain("objective-create");
		expect(skillNames).not.toContain("code-gt-restack-resolve");
		expect(skillNames).not.toContain("pr-address");
		expect(skillNames).not.toContain("typescript-fake-driven-testing");
		expect(skillNames).not.toContain("typescript-style");
	});

	test("tracks specialized skill-backed commands separately from generic backing skills", () => {
		const specialized = specializedSkillBackedCommandRegistrations();
		const specializedSkillNames = specialized.map((registration) => registration.skillName);
		const specializedSurfaces = specialized.map((registration) => registration.surface);

		expect(specializedSkillNames).not.toContain("ns-flow-gs-autobranch");
		expect(specializedSkillNames).not.toContain("ns-flow-gs-autoslot");
		expect(specializedSkillNames).toEqual(
			expect.arrayContaining([
				"branch-context-from-plan",
				"branch-context-impl",
				"handoff-create",
				"handoff-pickup",
				"objective-create",
				"objective-next",
				"objective-close",
				"objective-autorun",
				"ns-flow-gt-autobranch",
			]),
		);
		for (const surface of OBJECTIVE_COMMAND_SURFACES) {
			expect(specializedSurfaces).toContain(surface);
		}
		expect(specializedSurfaces).toContain("ns:handoff:create");
		expect(specializedSurfaces).not.toContain("code:workflows");
	});

	test("collects visible skill-backed command surfaces from the registry", () => {
		const surfaces = visibleSkillBackedCommandSurfaces();

		expect(new Set(surfaces).size).toBe(surfaces.length);
		expect(surfaces).toContain("code:workflows");
		for (const surface of OBJECTIVE_COMMAND_SURFACES) {
			expect(surfaces).toContain(surface);
		}
		expect(surfaces).toContain("ns:objective:refresh");
		expect(surfaces).toContain("ns:flow:gs:autobranch");
		expect(surfaces).toContain("ns:flow:gs:autoslot");
		expect(surfaces).toContain("ns:handoff:create");
		expect(surfaces).not.toContain("skill:x");
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
		["code-workflows", "code:workflows"],
		["ns-cli-design", "ns:cli:design"],
		["ns-flow-gs-autobranch", "ns:flow:gs:autobranch"],
		["ns-flow-gs-autoslot", "ns:flow:gs:autoslot"],
		["ns-typescript-style-tripwire", "ns:typescript:style-tripwire"],
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
		expect(derivePiReplacementCommand("ns-flow-gs-autobranch")).toEqual({
			surface: "ns:flow:gs:autobranch",
			skillName: "ns-flow-gs-autobranch",
			namespace: "ns",
			command: "flow:gs:autobranch",
		});
		expect(derivePiReplacementCommand("ns-flow-gs-autoslot")).toEqual({
			surface: "ns:flow:gs:autoslot",
			skillName: "ns-flow-gs-autoslot",
			namespace: "ns",
			command: "flow:gs:autoslot",
		});
	});

	test("does not derive specialized or unknown command metadata", () => {
		expect(derivePiReplacementCommand("objective-create")).toBeUndefined();
		expect(derivePiReplacementCommand("branch-context-from-plan")).toBeUndefined();
		expect(derivePiReplacementCommand("foo-bar-baz")).toBeUndefined();
	});
});

describe("genericSkillBackedCommandSpecs", () => {
	test("keeps generic backing skill rows and skips specialized command rows", () => {
		const specs = genericSkillBackedCommandSpecs();
		const surfaces = specs.map((spec) => spec.surface);
		const specializedSurfaces = new Set(
			specializedSkillBackedCommandRegistrations().map((registration) => registration.surface),
		);

		expect(surfaces).toContain("code:workflows");
		expect(surfaces).toContain("ns:objective:refresh");
		expect(surfaces).toContain("ns:flow:gs:autobranch");
		expect(surfaces).toContain("ns:flow:gs:autoslot");
		expect(surfaces).not.toContain("skill:x");
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

describe("registerSkillBackedCommands", () => {
	test.each([
		{
			skillName: "code-workflows",
			surface: "code:workflows",
			heading: "# Code Workflows",
		},
		{
			skillName: "ns-flow-gs-autobranch",
			surface: "ns:flow:gs:autobranch",
			heading: "# GS Autobranch",
		},
		{
			skillName: "ns-flow-gs-autoslot",
			surface: "ns:flow:gs:autoslot",
			heading: "# GS Autoslot",
		},
	])(
		"registers $surface with its exact effective skill and initial request",
		async ({ skillName, surface, heading }) => {
			await withTempRepoSkill(
				{
					skillName,
					markdown: `---\nname: ${skillName}\n---\n\n${heading}\n`,
					prefix: "skill-backed-command-",
				},
				async ({ skillPath }) => {
					const host = new FakeSkillBackedCommandHost();
					registerSkillBackedCommands(host);
					const command = host.commands.get(surface);
					expect(command).toBeDefined();

					await command?.handler(
						"fix ```this``` please",
						commandContext({
							name: skillName,
							filePath: skillPath,
							baseDir: skillPath.replace(/\/SKILL\.md$/u, ""),
						}),
					);

					expect(host.ackMessages).toEqual([
						expect.objectContaining({
							content: `→ /${surface} received; starting…`,
							customType: "ns-command-ack",
							display: true,
						}),
					]);
					expect(host.sentMessages).toHaveLength(1);
					expect(host.sentMessages[0]).toContain(
						`<skill name="${skillName}" location="${skillPath}">`,
					);
					expect(host.sentMessages[0]).toContain(heading);
					expect(host.sentMessages[0]).toContain("````text\nfix ```this``` please\n````");
				},
			);
		},
	);

	test.each([
		["code:workflows", "code-workflows"],
		["ns:flow:gs:autobranch", "ns-flow-gs-autobranch"],
		["ns:flow:gs:autoslot", "ns-flow-gs-autoslot"],
	])("/%s fails closed when effective skill %s is missing", async (surface, skillName) => {
		await withTempGitRepo({ prefix: "missing-skill-backed-command-" }, async () => {
			const host = new FakeSkillBackedCommandHost();
			registerSkillBackedCommands(host);
			const command = host.commands.get(surface);
			if (command === undefined) throw new Error("missing command");
			const ctx = commandContext();

			await command.handler("do work", ctx);

			expect(host.sentMessages).toEqual([]);
			expect(ctx.notifications).toHaveLength(1);
			expect(ctx.notifications[0]).toMatchObject({ level: "error" });
			expect(ctx.notifications[0]?.message).toContain(
				`Could not load required skill "${skillName}"`,
			);
		});
	});

	test("generic commands can read vendored backing skills from .agents/skills", async () => {
		await withTempRepoSkill(
			{
				skillName: "improve-codebase-architecture",
				markdown:
					"---\nname: improve-codebase-architecture\n---\n\n# Improve Codebase Architecture\n",
				prefix: "vendored-skill-backed-command-",
			},
			async ({ skillPath }) => {
				const host = new FakeSkillBackedCommandHost();
				registerSkillBackedCommands(host);
				const command = host.commands.get("improve:codebase-architecture");
				expect(command).toBeDefined();

				await command?.handler(
					"",
					commandContext({
						name: "improve-codebase-architecture",
						filePath: skillPath,
						baseDir: skillPath.replace(/\/SKILL\.md$/u, ""),
					}),
				);

				expect(host.sentMessages).toHaveLength(1);
				expect(host.sentMessages[0]).toContain(
					`<skill name="improve-codebase-architecture" location="${skillPath}">`,
				);
				expect(host.sentMessages[0]).toContain("# Improve Codebase Architecture");
			},
		);
	});
});
