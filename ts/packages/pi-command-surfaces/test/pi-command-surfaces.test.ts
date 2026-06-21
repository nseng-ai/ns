import { describe, expect, test } from "vitest";

import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	derivePiReplacementSurface,
	deriveVisiblePiReplacementSurfaces,
	genericCommandStyleSkillNames,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	SPECIALIZED_PI_COMMAND_SURFACES,
} from "../src/index.ts";

describe("Pi command surfaces", () => {
	test("derives specialized replacements before namespace and first-hyphen fallback", () => {
		expect(derivePiReplacementSurface("branch-context-from-plan")).toBe(
			BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
		);
		expect(derivePiReplacementSurface("branch-context-impl-extra")).toBe(
			`${IMPL_BRANCH_CONTEXT_COMMAND_NAME}-extra`,
		);
		expect(derivePiReplacementSurface("objective-stack-impl")).toBe("objective:stack-impl");
		expect(derivePiReplacementSurface("code-checkpoint")).toBe("sdl:cp");
		expect(derivePiReplacementSurface("foo-bar-baz")).toBe("foo:bar-baz");
		expect(derivePiReplacementSurface("plain")).toBeUndefined();
	});

	test("selects generic command-style skill names with the canonical filter", () => {
		const skillNames = genericCommandStyleSkillNames();

		expect(skillNames).toContain("pr-address");
		expect(skillNames).toContain("objective-close");
		expect(skillNames).toContain("code-workflows");
		expect(skillNames).not.toContain("objective-create");
		expect(skillNames).not.toContain("code-gt-restack-resolve");
		expect(skillNames).not.toContain("setup-dprint");
		expect(genericCommandStyleSkillNames(["plain", "foo-bar", "objective-create"])).toEqual([
			"foo-bar",
		]);
	});

	test("collects verified backing skill replacement surfaces from the canonical lists", () => {
		const surfaces = deriveVisiblePiReplacementSurfaces();

		expect(new Set(surfaces).size).toBe(surfaces.length);
		expect(surfaces).toEqual(expect.arrayContaining([...SPECIALIZED_PI_COMMAND_SURFACES]));
		expect(surfaces).toContain("pr:address");
		expect(surfaces).toContain("objective:close");
	});
});
