import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "Activate ns in a repository.",
	entries: [
		{
			kind: "raw-command",
			name: "init",
			load: async () => ({ default: (await import("./commands/init.ts")).nsInitNsCommand }),
		},
		{
			group: "extension",
			description: "Inspect and manage ns extensions.",
			entries: [
				{
					kind: "raw-command",
					name: "install",
					load: async () => ({
						default: (await import("./commands/extension-install.ts")).nsExtensionInstallCommand,
					}),
				},
				{
					kind: "raw-command",
					name: "list",
					load: async () => ({
						default: (await import("./commands/extension-list.ts")).nsExtensionListCommand,
					}),
				},
				{
					kind: "raw-command",
					name: "update",
					load: async () => ({
						default: (await import("./commands/extension-update.ts")).nsExtensionUpdateCommand,
					}),
				},
				{
					kind: "raw-command",
					name: "uninstall",
					load: async () => ({
						default: (await import("./commands/extension-uninstall.ts"))
							.nsExtensionUninstallCommand,
					}),
				},
			],
		},
	],
});
