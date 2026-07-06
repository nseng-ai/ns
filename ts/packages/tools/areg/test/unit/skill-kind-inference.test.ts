import { describe, expect, test } from "vitest";

import {
	inferSkillKindRecord,
	inspectSkillFrontmatter,
} from "../../src/operations/skill-kind-inference.ts";

type RecordOptions = {
	hasCodexSidecar?: boolean;
	isPiExcluded?: boolean;
	hasAgentsMirror?: boolean;
	hasClaudeMirror?: boolean;
	replacementVerified?: boolean;
} & ({ replacementSurface?: string } | { replacementSurfaceAbsent: true });

function record(skillMd: string, options: RecordOptions = {}) {
	const frontmatter = inspectSkillFrontmatter(skillMd, "SKILL.md");
	if (!frontmatter.ok) throw new Error(frontmatter.error.message);
	const surface =
		"replacementSurfaceAbsent" in options
			? undefined
			: (options.replacementSurface ?? "demo:skill");
	return inferSkillKindRecord({
		skillName: "demo-skill",
		frontmatter: frontmatter.value,
		hasCodexSidecar: options.hasCodexSidecar ?? false,
		isPiExcluded: options.isPiExcluded ?? false,
		hasAgentsMirror: options.hasAgentsMirror ?? false,
		hasClaudeMirror: options.hasClaudeMirror ?? false,
		replacement: {
			verified: options.replacementVerified ?? false,
			...(surface === undefined ? {} : { surface }),
		},
	});
}

const UNLISTED_SKILL = "---\nname: demo-skill\ndisable-model-invocation: true\n---\n";

const BASE = "---\nname: demo-skill\ndescription: Demo\n---\n";

describe("skill kind inference", () => {
	test("infers all clean desired kinds", () => {
		expect(record(BASE).kind).toBe("normal");
		expect(
			record("---\nname: demo-skill\ndisable-model-invocation: true\n---\n", {
				hasCodexSidecar: true,
			}).kind,
		).toBe("invoke-only");
		expect(
			record("---\nname: demo-skill\ndisable-model-invocation: true\n---\n", {
				hasCodexSidecar: true,
				isPiExcluded: true,
				replacementVerified: true,
			}).kind,
		).toBe("command-backed");
		expect(record("---\nname: demo-skill\nuser-invocable: false\n---\n").kind).toBe("ambient-only");
		expect(
			record(UNLISTED_SKILL, {
				hasCodexSidecar: true,
				isPiExcluded: true,
				replacementSurfaceAbsent: true,
			}).kind,
		).toBe("unlisted");
	});

	test("unlisted reports hidden/excluded status columns and the unlisted note", () => {
		const unlisted = record(UNLISTED_SKILL, {
			hasCodexSidecar: true,
			isPiExcluded: true,
			replacementSurfaceAbsent: true,
		});
		expect(unlisted.kind).toBe("unlisted");
		expect(unlisted.modelInvocation).toBe("disabled");
		expect(unlisted.nativeDirect).toBe("hidden");
		expect(unlisted.piExtension).toBe("excluded");
		expect(unlisted.notes).toEqual([
			"unlisted hides this skill from all harness typeaheads; canonical source remains skills/demo-skill/.",
		]);
	});

	test("unlisted requires registry absence and both mirrors absent", () => {
		// Registry row still present (surface defined) => not unlisted.
		expect(record(UNLISTED_SKILL, { hasCodexSidecar: true, isPiExcluded: true }).kind).toBe(
			"inconsistent",
		);
		// Any mirror present => degraded, not unlisted.
		expect(
			record(UNLISTED_SKILL, {
				hasCodexSidecar: true,
				isPiExcluded: true,
				hasAgentsMirror: true,
				replacementSurfaceAbsent: true,
			}).kind,
		).toBe("inconsistent");
		expect(
			record(UNLISTED_SKILL, {
				hasCodexSidecar: true,
				isPiExcluded: true,
				hasClaudeMirror: true,
				replacementSurfaceAbsent: true,
			}).kind,
		).toBe("inconsistent");
		// Missing sidecar or missing exclusion => other degraded/desired states.
		expect(
			record(UNLISTED_SKILL, { isPiExcluded: true, replacementSurfaceAbsent: true }).kind,
		).toBe("inconsistent");
		expect(
			record(UNLISTED_SKILL, { hasCodexSidecar: true, replacementSurfaceAbsent: true }).kind,
		).toBe("invoke-only");
	});

	test("mirror presence does not change listed-kind inference", () => {
		expect(
			record(UNLISTED_SKILL, {
				hasCodexSidecar: true,
				isPiExcluded: true,
				replacementVerified: true,
				hasAgentsMirror: true,
				hasClaudeMirror: true,
			}).kind,
		).toBe("command-backed");
		expect(record(BASE, { hasAgentsMirror: true, hasClaudeMirror: true }).kind).toBe("normal");
	});

	test("reports mixed before generic inconsistent when user-invocable combines with explicit artifacts", () => {
		const mixed = record(
			"---\nname: demo-skill\nuser-invocable: false\ndisable-model-invocation: true\n---\n",
			{ hasCodexSidecar: true },
		);
		expect(mixed.kind).toBe("mixed");
		expect(mixed.nativeDirect).toBe("mixed");
		expect(mixed.notes).toContain(
			"user-invocable:false is mixed with explicit-only or Pi-exclusion artifacts.",
		);
	});

	test("reports status dimensions and notes for inconsistent artifacts", () => {
		const inconsistent = record(
			"---\nname: demo-skill\ndisable-model-invocation: true\nuser-invocable: yes\n---\n",
			{ isPiExcluded: true },
		);
		expect(inconsistent.kind).toBe("mixed");
		expect(inconsistent.modelInvocation).toBe("mixed");
		expect(inconsistent.piExtension).toBe("missing");
		expect(inconsistent.notes).toEqual([
			"disable-model-invocation is present but agents/openai.yaml is missing.",
			' user-invocable is present with value "yes", not false.'.trimStart(),
			"Pi skill exclusion is present without a verified replacement command.",
		]);
	});
});
