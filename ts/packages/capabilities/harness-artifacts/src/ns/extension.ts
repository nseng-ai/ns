import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "List and provision ns-owned skills into assistant harnesses.",
	entries: [
		{
			group: "skills",
			description: "List and provision ns-owned skills into assistant harnesses.",
			entries: [
				{
					kind: "raw-command",
					name: "list",
					load: async () => ({ default: (await import("./commands/list.ts")).skillsListNsCommand }),
				},
				{
					kind: "raw-command",
					name: "path",
					load: async () => ({ default: (await import("./commands/path.ts")).skillsPathNsCommand }),
				},
				{
					kind: "raw-command",
					name: "install",
					load: async () => ({
						default: (await import("./commands/install.ts")).skillsInstallNsCommand,
					}),
				},
			],
		},
		{
			kind: "raw-command",
			name: "update",
			load: async () => ({ default: (await import("./commands/update.ts")).nsUpdateCommand }),
		},
	],
});
