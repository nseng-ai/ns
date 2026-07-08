import { defineExtension } from "@nseng-ai/kernel/sdk";

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
		{
			name: "exec-record-findings",
			load: async () => ({
				default: (await import("./commands/exec-record-findings.ts"))
					.reviewsExecRecordFindingsCommand,
			}),
		},
		{
			name: "exec-publish-findings",
			load: async () => ({
				default: (await import("./commands/exec-publish-findings.ts"))
					.reviewsExecPublishFindingsCommand,
			}),
		},
	],
});
