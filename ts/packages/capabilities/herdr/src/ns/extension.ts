import { defineExtension, hiddenExecGroup } from "@nseng-ai/sdk";

export default defineExtension({
	group: "herdr",
	description: "Run Herdr destination workflows.",
	entries: [
		hiddenExecGroup("Agent-only Herdr operations.", [
			{
				group: "handoff-tab",
				description: "Launch stored handoffs in Herdr tabs.",
				entries: [
					{
						kind: "raw-command",
						name: "launch",
						load: async () => ({
							default: (await import("./commands/handoff-tab-launch.ts"))
								.herdrHandoffTabLaunchNsCommand,
						}),
					},
				],
			},
		]),
	],
});
