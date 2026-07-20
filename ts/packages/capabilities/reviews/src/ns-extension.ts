import { defineExtension, hiddenExecGroup } from "@nseng-ai/sdk";

export default defineExtension({
	group: "reviews",
	description: "Run configured code reviews and publish findings.",
	entries: [
		{
			kind: "raw-command",
			name: "list",
			load: async () => ({ default: (await import("./commands/list.ts")).reviewListCommand }),
		},
		{
			kind: "raw-command",
			name: "ls",
			load: async () => ({ default: (await import("./commands/ls.ts")).reviewLsCommand }),
		},
		{
			kind: "raw-command",
			name: "log",
			load: async () => ({ default: (await import("./commands/log.ts")).reviewLogCommand }),
		},
		{
			kind: "raw-command",
			name: "run",
			load: async () => ({ default: (await import("./commands/run.ts")).reviewRunCommand }),
		},
		hiddenExecGroup("Agent-only Reviews operations.", [
			{
				kind: "raw-command",
				name: "record-findings",
				load: async () => ({
					default: (await import("./commands/exec-record-findings.ts"))
						.reviewsExecRecordFindingsCommand,
				}),
			},
			{
				kind: "raw-command",
				name: "publish-findings",
				load: async () => ({
					default: (await import("./commands/exec-publish-findings.ts"))
						.reviewsExecPublishFindingsCommand,
				}),
			},
		]),
	],
});
