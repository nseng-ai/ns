import { defineExtension, hiddenExecGroup } from "@nseng-ai/sdk";

export default defineExtension({
	group: "handoff",
	description: "Create, list, pick up, and clean up branch handoffs.",
	entries: [
		{
			kind: "raw-command",
			name: "list",
			load: async () => ({ default: (await import("./commands/list.ts")).handoffListNsCommand }),
		},
		{
			kind: "raw-command",
			name: "delete",
			load: async () => ({
				default: (await import("./commands/delete.ts")).handoffDeleteNsCommand,
			}),
		},
		{
			kind: "raw-command",
			name: "gc",
			load: async () => ({ default: (await import("./commands/gc.ts")).handoffGcNsCommand }),
		},
		{
			kind: "raw-command",
			name: "create",
			load: async () => ({
				default: (await import("./commands/create.ts")).handoffCreateNsCommand,
			}),
		},
		{
			kind: "raw-command",
			name: "pickup",
			load: async () => ({
				default: (await import("./commands/pickup.ts")).handoffPickupNsCommand,
			}),
		},
		hiddenExecGroup("Agent-only handoff operations.", [
			{
				kind: "raw-command",
				name: "match",
				load: async () => ({
					default: (await import("./commands/exec-match.ts")).handoffExecMatchNsCommand,
				}),
			},
		]),
	],
});
