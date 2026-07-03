import { describe, expect, test } from "vitest";

import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	derivePiReplacementSurface,
	deriveVisiblePiReplacementSurfaces,
	genericCommandStyleSkillNames,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	SPECIALIZED_PI_COMMAND_SURFACES,
} from "../../src/commands/surfaces.ts";

describe("Pi command surfaces", () => {
	test("derives specialized replacements before namespace and first-hyphen fallback", () => {
		expect(derivePiReplacementSurface("branch-context-from-plan")).toBe(
			BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
		);
		expect(derivePiReplacementSurface("branch-context-impl-extra")).toBe(
			`${IMPL_BRANCH_CONTEXT_COMMAND_NAME}-extra`,
		);
		expect(derivePiReplacementSurface("objective-close")).toBe("objective:close");
		expect(derivePiReplacementSurface("objective-stack-impl")).toBe("objective:stack-impl");
		expect(derivePiReplacementSurface("sdl-flow-branch-latest-commit")).toBe(
			"ji:flow:branch-latest-commit",
		);
		expect(derivePiReplacementSurface("sdl-flow-cp")).toBe("ji:flow:cp");
		expect(derivePiReplacementSurface("sdl-flow-submit")).toBe("ji:flow:submit");
		expect(derivePiReplacementSurface("pytest")).toBe("python:pytest");
		expect(derivePiReplacementSurface("skillx")).toBe("skill:x");
		expect(derivePiReplacementSurface("foo-bar-baz")).toBe("foo:bar-baz");
		expect(derivePiReplacementSurface("plain")).toBeUndefined();
	});

	test("selects generic command-style skill names with the canonical filter", () => {
		const skillNames = genericCommandStyleSkillNames();

		expect(skillNames).toContain("code-workflows");
		expect(skillNames).not.toContain("pr-address");
		expect(skillNames).not.toContain("objective-close");
		expect(skillNames).not.toContain("grill-me");
		expect(skillNames).not.toContain("grill-with-docs");
		expect(skillNames).toContain("code-workflows");
		expect(skillNames).toEqual(
			expect.arrayContaining([
				"dignified-python",
				"setup-dprint",
				"setup-dprint-gh-ci",
				"setup-graphite",
				"setup-pypi-publish",
				"setup-python-gh-ci",
			]),
		);
		expect(skillNames).not.toContain("objective-create");
		expect(skillNames).not.toContain("code-gh");
		expect(skillNames).not.toContain("code-gt-restack-resolve");
		expect(skillNames).not.toContain("typescript-fake-driven-testing");
		expect(skillNames).not.toContain("typescript-style");
		expect(genericCommandStyleSkillNames(["plain", "foo-bar", "objective-create"])).toEqual([
			"foo-bar",
		]);
	});

	test("collects verified backing skill replacement surfaces from the canonical lists", () => {
		const surfaces = deriveVisiblePiReplacementSurfaces();

		expect(new Set(surfaces).size).toBe(surfaces.length);
		expect(surfaces).toEqual(expect.arrayContaining([...SPECIALIZED_PI_COMMAND_SURFACES]));
		expect(surfaces).toContain("code:workflows");
		expect(surfaces).not.toContain("pr:address");
		expect(surfaces).not.toContain("cli:push-down");
		expect(surfaces).not.toContain("code:gh");
		expect(surfaces).not.toContain("typescript:fake-driven-testing");
		expect(surfaces).not.toContain("typescript:style");
		expect(surfaces).toContain("objective:close");
		expect(surfaces).toContain("pi:grill-me");
		expect(surfaces).toContain("pi:grill-with-docs");
		expect(surfaces).not.toContain("grill:me");
		expect(surfaces).not.toContain("grill:with-docs");
		expect(surfaces).toContain("setup:dprint");
		expect(surfaces).toContain("setup:python-gh-ci");
		expect(surfaces).toContain("dignified:python");
		expect(surfaces).toContain("python:pytest");
		expect(surfaces).toContain("skill:x");
	});
});
