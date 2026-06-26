import { describe, expect, test } from "vitest";

import {
	inferSkillKindRecord,
	inspectSkillFrontmatter,
} from "../../src/operations/skill-kind-inference.ts";

function record(
	skillMd: string,
	options: {
		hasCodexSidecar?: boolean;
		isPiExcluded?: boolean;
		replacementVerified?: boolean;
	} = {},
) {
	const frontmatter = inspectSkillFrontmatter(skillMd, "SKILL.md");
	if (!frontmatter.ok) throw new Error(frontmatter.error.message);
	return inferSkillKindRecord({
		skillName: "demo-skill",
		frontmatter: frontmatter.value,
		hasCodexSidecar: options.hasCodexSidecar ?? false,
		isPiExcluded: options.isPiExcluded ?? false,
		replacement: { verified: options.replacementVerified ?? false, surface: "demo:skill" },
	});
}

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
