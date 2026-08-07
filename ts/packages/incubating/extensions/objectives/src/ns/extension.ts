import { defineExtension } from "@nseng-ai/sdk";

const OBJECTIVES_INSTRUCTIONS = [
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

const objectivesExtensionDescriptor = defineExtension({
	description: "Inspect and maintain ns Objective records.",
	commandDirectory: `${import.meta.dirname.slice(0, -3)}/cli`,
	activation: {
		instructions: OBJECTIVES_INSTRUCTIONS,
		consumerDirs: [".ns/objectives"],
	},
});

export default objectivesExtensionDescriptor;
