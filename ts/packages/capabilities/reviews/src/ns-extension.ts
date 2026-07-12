import { defineExtension, hiddenExecGroup } from "@nseng-ai/sdk/sdk";

export default defineExtension({
	group: "reviews",
	description: "Run configured code reviews and publish findings.",
	entries: [
		{
			name: "list",
			load: async () => ({ default: (await import("./commands/list.ts")).reviewListCommand }),
		},
		{
			name: "ls",
			load: async () => ({ default: (await import("./commands/ls.ts")).reviewLsCommand }),
		},
		{
			name: "log",
			load: async () => ({ default: (await import("./commands/log.ts")).reviewLogCommand }),
		},
		{
			name: "run",
			load: async () => ({ default: (await import("./commands/run.ts")).reviewRunCommand }),
		},
		hiddenExecGroup("Agent-only Reviews operations.", [
			{
				name: "record-findings",
				load: async () => ({
					default: (await import("./commands/exec-record-findings.ts"))
						.reviewsExecRecordFindingsCommand,
				}),
			},
			{
				name: "publish-findings",
				load: async () => ({
					default: (await import("./commands/exec-publish-findings.ts"))
						.reviewsExecPublishFindingsCommand,
				}),
			},
		]),
	],
});
