import { defineExtension, hiddenExecGroup } from "@nseng-ai/sdk";

export default defineExtension({
	group: "handoff",
	description: "Create, list, pick up, and clean up branch handoffs.",
	entries: [
		{
			name: "list",
			load: async () => ({ default: (await import("./commands/list.ts")).handoffListNsCommand }),
		},
		{
			name: "delete",
			load: async () => ({
				default: (await import("./commands/delete.ts")).handoffDeleteNsCommand,
			}),
		},
		{
			name: "gc",
			load: async () => ({ default: (await import("./commands/gc.ts")).handoffGcNsCommand }),
		},
		{
			name: "create",
			load: async () => ({
				default: (await import("./commands/create.ts")).handoffCreateNsCommand,
			}),
		},
		{
			name: "pickup",
			load: async () => ({
				default: (await import("./commands/pickup.ts")).handoffPickupNsCommand,
			}),
		},
		hiddenExecGroup("Agent-only handoff operations.", [
			{
				name: "match",
				load: async () => ({
					default: (await import("./commands/exec-match.ts")).handoffExecMatchNsCommand,
				}),
			},
		]),
	],
});
