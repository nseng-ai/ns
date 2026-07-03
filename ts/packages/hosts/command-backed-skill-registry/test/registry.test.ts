import { describe, expect, test } from "vitest";

import { CREATE_HANDOFF_COMMAND_NAME, PICKUP_HANDOFF_COMMAND_NAME } from "@ji/handoff/pi";
import { objectiveCommandSpecs, objectiveCreateCommandSpec } from "@ji/objective/api";
import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
} from "@ji/pi/commands";

import {
	commandBackedSkillRegistrations,
	commandBackedSkillSurface,
	genericBackingSkillRegistrations,
	specializedCommandBackedSkillRegistrations,
	visibleCommandBackedReplacementSurfaces,
} from "../src/index.ts";

describe("command-backed skill registry", () => {
	test("has unique skill names and surfaces", () => {
		const registrations = commandBackedSkillRegistrations();
		const skillNames = registrations.map((registration) => registration.skillName);
		const surfaces = registrations.map((registration) => registration.surface);

		expect(new Set(skillNames).size).toBe(skillNames.length);
		expect(new Set(surfaces).size).toBe(surfaces.length);
	});

	test("uses Handoff provider-owned command constants", () => {
		expect(commandBackedSkillSurface("handoff-create")).toBe(CREATE_HANDOFF_COMMAND_NAME);
		expect(commandBackedSkillSurface("handoff-pickup")).toBe(PICKUP_HANDOFF_COMMAND_NAME);
	});

	test("uses Pi-owned command constants", () => {
		expect(commandBackedSkillSurface("branch-context-from-plan")).toBe(
			BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
		);
		expect(commandBackedSkillSurface("branch-context-impl")).toBe(IMPL_BRANCH_CONTEXT_COMMAND_NAME);
		expect(commandBackedSkillSurface("enriched-plan-save")).toBe(WRITE_PLAN_COMMAND_NAME);
	});

	test("uses Objective provider-owned command specs", () => {
		expect(commandBackedSkillSurface(objectiveCreateCommandSpec.skillName)).toBe(
			objectiveCreateCommandSpec.commandName,
		);
		for (const spec of objectiveCommandSpecs) {
			expect(commandBackedSkillSurface(spec.skillName)).toBe(spec.commandName);
		}
	});

	test("filters generic and specialized registrations", () => {
		const genericSkillNames = genericBackingSkillRegistrations().map(
			(registration) => registration.skillName,
		);
		const specializedSkillNames = specializedCommandBackedSkillRegistrations().map(
			(registration) => registration.skillName,
		);

		expect(genericSkillNames).toContain("code-workflows");
		expect(genericSkillNames).toContain("objective-refresh");
		expect(genericSkillNames).not.toContain("objective-create");
		expect(specializedSkillNames).toContain("handoff-create");
		expect(specializedSkillNames).toContain("objective-create");
		expect(specializedSkillNames).not.toContain("code-workflows");
	});

	test("collects visible replacement surfaces", () => {
		const surfaces = visibleCommandBackedReplacementSurfaces();

		expect(surfaces).toContain(CREATE_HANDOFF_COMMAND_NAME);
		expect(surfaces).toContain(objectiveCreateCommandSpec.commandName);
		expect(surfaces).toContain("code:workflows");
		expect(surfaces).not.toContain("foo:bar-baz");
	});
});
