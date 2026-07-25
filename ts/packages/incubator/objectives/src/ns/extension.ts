import { defineExtension, hiddenExecGroup } from "@nseng-ai/sdk";

const { objectiveBundledArtifacts } = await import("./publish-artifacts.ts");

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

export default defineExtension({
	group: "objective",
	description: "Inspect and maintain ns Objective records.",
	activation: {
		instructions: OBJECTIVES_INSTRUCTIONS,
		consumerDirs: [".ns/objectives"],
	},
	bundledArtifacts: objectiveBundledArtifacts,
	entries: [
		{
			name: "list",
			load: async () => ({ default: (await import("./commands/list.ts")).objectiveListNsCommand }),
		},
		{
			name: "show",
			load: async () => ({ default: (await import("./commands/show.ts")).objectiveShowNsCommand }),
		},
		{
			name: "check",
			load: async () => ({
				default: (await import("./commands/check.ts")).objectiveCheckNsCommand,
			}),
		},
		hiddenExecGroup("Agent-only Objective operations.", [
			{
				name: "list-candidates",
				load: async () => ({
					default: (await import("./commands/exec-list-candidates.ts"))
						.objectiveExecListCandidatesNsCommand,
				}),
			},
			{
				name: "load-orientations",
				load: async () => ({
					default: (await import("./commands/exec-load-orientations.ts"))
						.objectiveExecLoadOrientationsNsCommand,
				}),
			},
			{
				name: "read-objective",
				load: async () => ({
					default: (await import("./commands/exec-read-objective.ts"))
						.objectiveExecReadObjectiveNsCommand,
				}),
			},
			{
				name: "publication-bind",
				load: async () => ({
					default: (await import("./commands/exec-publication-bind.ts"))
						.objectiveExecPublicationBindNsCommand,
				}),
			},
			{
				name: "publication-publish",
				load: async () => ({
					default: (await import("./commands/exec-publication-publish.ts"))
						.objectiveExecPublicationPublishNsCommand,
				}),
			},
			{
				name: "runner-begin",
				load: async () => ({
					default: (await import("./commands/exec-runner-begin.ts"))
						.objectiveExecRunnerBeginNsCommand,
				}),
			},
			{
				name: "runner-finish",
				load: async () => ({
					default: (await import("./commands/exec-runner-finish.ts"))
						.objectiveExecRunnerFinishNsCommand,
				}),
			},
			{
				name: "runner-subagent-usage",
				load: async () => ({
					default: (await import("./commands/exec-runner-subagent-usage.ts"))
						.objectiveExecRunnerSubagentUsageNsCommand,
				}),
			},
			{
				name: "tracking-gate",
				load: async () => ({
					default: (await import("./commands/exec-tracking-gate.ts"))
						.objectiveExecTrackingGateNsCommand,
				}),
			},
		]),
	],
});
