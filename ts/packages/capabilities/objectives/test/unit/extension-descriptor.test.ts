import { validateExtensionDescriptor } from "@nseng-ai/sdk";
import objectivesExtension from "@nseng-ai/objectives/ns-extension";
import { describe, expect, test } from "vitest";

const EXPECTED_OBJECTIVE_SKILLS = [
	"objective",
	"objective-autorun",
	"objective-close",
	"objective-create",
	"objective-critique",
	"objective-next",
	"objective-refresh",
	"objective-retro",
	"objective-runner-step",
	"objective-update",
];

const EXPECTED_OBJECTIVES_INSTRUCTIONS = [
	"## Objectives",
	"",
	"This repository uses ns Objectives: durable planning records under `.ns/objectives/`",
	"that carry work across sessions and branches.",
	"",
	"- Before starting non-trivial work, run `ns objective list` and read any Objective that",
	"  overlaps your task (start with its `objective.md` and `roadmap.md`).",
	"- Also run `ns objective exec load-orientations --format md` and treat any output as",
	"  standing repository rules while present.",
	"- Use the `ns objective` CLI and the objective skills to create, advance, update, and",
	"  close Objectives.",
].join("\n");

describe("Objectives extension descriptor", () => {
	test("declares its exact activation contract", () => {
		const result = validateExtensionDescriptor(objectivesExtension);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.descriptor.activation).toEqual({
			instructions: EXPECTED_OBJECTIVES_INSTRUCTIONS,
			consumerDirs: [".ns/objectives"],
		});
		expect(result.descriptor.bundledArtifacts).toEqual(
			EXPECTED_OBJECTIVE_SKILLS.map((skillName) => ({
				kind: "skill",
				name: skillName,
				path: `skills/${skillName}`,
			})),
		);
	});
});
