import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	description: "List and provision ns-owned skills into assistant harnesses.",
	entries: [
		{
			group: "skills",
			description: "List and provision ns-owned skills into assistant harnesses.",
			entries: [
				{
					name: "list",
					load: async () => ({ default: (await import("./commands/list.ts")).skillsListNsCommand }),
				},
				{
					name: "path",
					load: async () => ({ default: (await import("./commands/path.ts")).skillsPathNsCommand }),
				},
				{
					name: "install",
					load: async () => ({
						default: (await import("./commands/install.ts")).skillsInstallNsCommand,
					}),
				},
			],
		},
		{
			name: "update",
			load: async () => ({ default: (await import("./commands/update.ts")).nsUpdateCommand }),
		},
	],
});
