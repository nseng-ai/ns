import { describe, expect, test } from "vitest";

import {
	CREATE_HANDOFF_COMMAND_NAME,
	HANDOFF_TAB_COMMAND_NAME,
	PICKUP_HANDOFF_COMMAND_NAME,
} from "@nseng-ai/handoffs/pi";
import { objectiveCommandSpecs, objectiveCreateCommandSpec } from "@nseng-ai/objectives/api";
import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
} from "@nseng-ai/branch-context/pi";

import {
	commandBackedSkillRegistrations,
	commandBackedSkillSurface,
	genericBackingSkillRegistrations,
	specializedCommandBackedSkillRegistrations,
	visibleCommandBackedReplacementSurfaces,
} from "../../src/command-backed-skill-registry.ts";

// Built via join("") on purpose: repo-wide greps validating the /ns:* rename
// sweep for these legacy prefixes as literals, and this test asserting their
// absence must not show up as a hit.
const LEGACY_OBJECTIVE_PREFIX = ["objective", ":"].join("");
const LEGACY_HANDOFF_PREFIX = ["handoff", ":"].join("");
const LEGACY_CCC_PREFIX = ["ccc", ":"].join("");

const ALLOWED_FOLLOW_UP_SURFACE_PREFIXES = [
	"branch:",
	"changelog:",
	"code:",
	"context:",
	"dignified:",
	"fdt:",
	"improve:",
	"pi:",
	"python:",
	"refactor:",
	"reinvented:",
	"review:",
	"skill:",
	"thermo:",
	"ts:",
	"writing:",
] as const;

describe("command-backed skill registry", () => {
	test("has unique skill names and surfaces", () => {
		const registrations = commandBackedSkillRegistrations();
		const skillNames = registrations.map((registration) => registration.skillName);
		// Handoff registers /ns:cmux:handoff-tab in the cmux namespace without a
		// skill row; include it so a future cmux surface cannot collide silently.
		const surfaces = [
			...registrations.map((registration) => registration.surface),
			HANDOFF_TAB_COMMAND_NAME,
		];

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

	test("uses cmux and Flow provider-owned registrations", () => {
		expect(commandBackedSkillSurface("ns-flow-autobranch")).toBe("ns:flow:autobranch");
		expect(commandBackedSkillSurface("ns-flow-branch-latest-commit")).toBe(
			"ns:flow:branch-latest-commit",
		);
		expect(commandBackedSkillSurface("ns-flow-cp")).toBe("ns:flow:cp");
		expect(commandBackedSkillSurface("ns-flow-submit")).toBe("ns:flow:submit");
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

	test("keeps migrated Objective Handoff and CCC surfaces out of legacy top-level namespaces", () => {
		const surfaces = visibleCommandBackedReplacementSurfaces();

		expect(surfaces.filter((surface) => surface.startsWith(LEGACY_OBJECTIVE_PREFIX))).toEqual([]);
		expect(surfaces.filter((surface) => surface.startsWith(LEGACY_HANDOFF_PREFIX))).toEqual([]);
		expect(surfaces.filter((surface) => surface.startsWith(LEGACY_CCC_PREFIX))).toEqual([]);
	});

	test("classifies remaining non-ns command surfaces as explicit follow-up prefixes", () => {
		const unnamespacedSurfaces = visibleCommandBackedReplacementSurfaces().filter(
			(surface) => !surface.startsWith("ns:"),
		);

		for (const surface of unnamespacedSurfaces) {
			expect(ALLOWED_FOLLOW_UP_SURFACE_PREFIXES.some((prefix) => surface.startsWith(prefix))).toBe(
				true,
			);
		}
	});
});
