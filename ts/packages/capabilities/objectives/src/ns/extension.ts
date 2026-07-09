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
			name: "exec-list-candidates",
			load: async () => ({
				default: (await import("./commands/exec-list-candidates.ts"))
					.objectiveExecListCandidatesNsCommand,
			}),
		},
		{
			name: "exec-load-orientations",
			load: async () => ({
				default: (await import("./commands/exec-load-orientations.ts"))
					.objectiveExecLoadOrientationsNsCommand,
			}),
		},
		{
			name: "exec-read-objective",
			load: async () => ({
				default: (await import("./commands/exec-read-objective.ts"))
					.objectiveExecReadObjectiveNsCommand,
			}),
		},
		{
			name: "exec-runner-begin",
			load: async () => ({
				default: (await import("./commands/exec-runner-begin.ts"))
					.objectiveExecRunnerBeginNsCommand,
			}),
		},
		{
			name: "exec-runner-finish",
			load: async () => ({
				default: (await import("./commands/exec-runner-finish.ts"))
					.objectiveExecRunnerFinishNsCommand,
			}),
		},
		{
			name: "exec-runner-subagent-usage",
			load: async () => ({
				default: (await import("./commands/exec-runner-subagent-usage.ts"))
					.objectiveExecRunnerSubagentUsageNsCommand,
			}),
		},
		{
			name: "exec-tracking-gate",
			load: async () => ({
				default: (await import("./commands/exec-tracking-gate.ts"))
					.objectiveExecTrackingGateNsCommand,
			}),
		},
	],
});
