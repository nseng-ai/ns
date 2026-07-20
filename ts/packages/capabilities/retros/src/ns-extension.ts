import { defineExtension, hiddenExecGroup } from "@nseng-ai/sdk";

export default defineExtension({
	group: "retro",
	description: "Collect branch retrospective evidence for agents.",
	entries: [
		hiddenExecGroup("Agent-only Retro operations.", [
			{
				kind: "raw-command",
				name: "collect-evidence",
				load: async () => ({
					default: (await import("./ns/commands/exec-collect-evidence.ts"))
						.retrosExecCollectEvidenceNsCommand,
				}),
			},
			{
				kind: "raw-command",
				name: "read-evidence-detail",
				load: async () => ({
					default: (await import("./ns/commands/exec-read-evidence-detail.ts"))
						.retrosExecReadEvidenceDetailNsCommand,
				}),
			},
		]),
	],
});
