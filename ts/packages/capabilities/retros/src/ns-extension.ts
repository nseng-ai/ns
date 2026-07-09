import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	group: "retro",
	description: "Collect branch retrospective evidence for agents.",
	entries: [
		{
			group: "exec",
			hidden: true,
			description: "Agent-only Retro operations.",
			entries: [
				{
					name: "collect-evidence",
					load: async () => ({
						default: (await import("./ns/commands/exec-collect-evidence.ts"))
							.retrosExecCollectEvidenceNsCommand,
					}),
				},
				{
					name: "read-evidence-detail",
					load: async () => ({
						default: (await import("./ns/commands/exec-read-evidence-detail.ts"))
							.retrosExecReadEvidenceDetailNsCommand,
					}),
				},
			],
		},
	],
});
