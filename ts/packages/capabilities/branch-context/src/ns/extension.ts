import { defineExtension, hiddenExecGroup } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	group: "branch-context",
	description: "Create and load branch-scoped implementation context.",
	points: [
		{
			id: "branch-context.plans-write",
			accepts: "prompt",
			cardinality: "one",
			description: "Custom prompt body for saved-plan authoring.",
			default: "../pi/prompts/plans-write-default.md",
		},
	],
	entries: [
		hiddenExecGroup("Agent-only branch-context operations.", [
			{
				name: "from-plan",
				load: async () => ({
					default: (await import("./commands/from-plan.ts")).branchContextFromPlanNsCommand,
				}),
			},
			{
				name: "load",
				load: async () => ({
					default: (await import("./commands/load.ts")).branchContextLoadNsCommand,
				}),
			},
			{
				name: "attach",
				load: async () => ({
					default: (await import("./commands/attach.ts")).branchContextAttachNsCommand,
				}),
			},
			{
				name: "list",
				load: async () => ({
					default: (await import("./commands/list.ts")).branchContextListNsCommand,
				}),
			},
			{
				name: "check",
				load: async () => ({
					default: (await import("./commands/check.ts")).branchContextCheckNsCommand,
				}),
			},
			{
				name: "delete",
				load: async () => ({
					default: (await import("./commands/delete.ts")).branchContextDeleteNsCommand,
				}),
			},
		]),
	],
});
