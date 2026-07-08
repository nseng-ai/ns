import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	group: "branch-context",
	description: "Create and load branch-scoped implementation context.",
	entries: [
		{
			group: "exec",
			hidden: true,
			description: "Agent-only branch-context operations.",
			entries: [
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
			],
		},
	],
});
