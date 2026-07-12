import { defineExtension, hiddenExecGroup } from "@nseng-ai/sdk";

export default defineExtension({
	group: "cmux",
	description: "Cmux workspace orchestration tools.",
	entries: [
		hiddenExecGroup("Agent-only cmux workspace operations.", [
			{
				name: "workspace-summary",
				load: async () => ({
					default: (await import("./commands/workspace-summary.ts")).cmuxWorkspaceSummaryNsCommand,
				}),
			},
		]),
	],
});
