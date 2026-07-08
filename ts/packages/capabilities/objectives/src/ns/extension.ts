import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	group: "objective",
	description: "Inspect and maintain ns Objective records.",
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
		{
			group: "exec",
			hidden: true,
			description: "Agent-only Objective operations.",
			entries: [
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
			],
		},
	],
});
