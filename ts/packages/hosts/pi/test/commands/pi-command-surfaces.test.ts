import { describe, expect, test } from "vitest";

import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	commandBackedSkillRegistrations,
	commandBackedSkillSurface,
	genericBackingSkillRegistrations,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	specializedCommandBackedSkillRegistrations,
	visibleCommandBackedReplacementSurfaces,
} from "../../src/commands/surfaces.ts";

describe("Pi command surfaces", () => {
	test("uses one explicit command-backed skill registry", () => {
		expect(commandBackedSkillSurface("branch-context-from-plan")).toBe(
			BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
		);
		expect(commandBackedSkillSurface("branch-context-impl")).toBe(IMPL_BRANCH_CONTEXT_COMMAND_NAME);
		expect(commandBackedSkillSurface("objective-close")).toBe("sdl:objective:close");
		expect(commandBackedSkillSurface("objective-stack-impl")).toBe("sdl:objective:stack-impl");
		expect(commandBackedSkillSurface("objective-refresh")).toBe("sdl:objective:refresh");
		expect(commandBackedSkillSurface("handoff-create")).toBe("sdl:handoff:create");
		expect(commandBackedSkillSurface("handoff-pickup")).toBe("sdl:handoff:pickup");
		expect(commandBackedSkillSurface("sdl-flow-branch-latest-commit")).toBe(
			"ji:flow:branch-latest-commit",
		);
		expect(commandBackedSkillSurface("sdl-flow-cp")).toBe("ji:flow:cp");
		expect(commandBackedSkillSurface("sdl-flow-submit")).toBe("ji:flow:submit");
		expect(commandBackedSkillSurface("sdl-cli-design")).toBe("sdl:cli:design");
		expect(commandBackedSkillSurface("sdl-typescript-style-tripwire")).toBe(
			"sdl:typescript:style-tripwire",
		);
		expect(commandBackedSkillSurface("pytest")).toBe("python:pytest");
		expect(commandBackedSkillSurface("skillx")).toBe("skill:x");
		expect(commandBackedSkillSurface("foo-bar-baz")).toBeUndefined();
		expect(commandBackedSkillSurface("plain")).toBeUndefined();
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
				"sdl-flow-autobranch",
			]),
		);
		expect(specializedSurfaces).toContain("sdl:objective:close");
		expect(specializedSurfaces).toContain("sdl:handoff:create");
		expect(specializedSurfaces).toContain("pi:grill-me");
		expect(specializedSurfaces).not.toContain("code:workflows");
	});

	test("collects visible backing skill replacement surfaces from the registry", () => {
		const surfaces = visibleCommandBackedReplacementSurfaces();

		expect(new Set(surfaces).size).toBe(surfaces.length);
		expect(surfaces).toContain("code:workflows");
		expect(surfaces).toContain("sdl:objective:close");
		expect(surfaces).toContain("sdl:objective:refresh");
		expect(surfaces).toContain("sdl:handoff:create");
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
