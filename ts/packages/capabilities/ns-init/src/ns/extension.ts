import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	description: "Activate ns in a repository.",
	entries: [
		{
			name: "init",
			load: async () => ({ default: (await import("./commands/init.ts")).nsInitNsCommand }),
		},
	],
});
