import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	description: "Activate ns in a repository.",
	entries: [
		{
			name: "init",
			load: async () => ({ default: (await import("./commands/init.ts")).nsInitNsCommand }),
		},
		{
			group: "extension",
			description: "Inspect and manage ns extensions.",
			entries: [
				{
					name: "install",
					load: async () => ({
						default: (await import("./commands/extension-install.ts")).nsExtensionInstallCommand,
					}),
				},
				{
					name: "update",
					load: async () => ({
						default: (await import("./commands/extension-update.ts")).nsExtensionUpdateCommand,
					}),
				},
				{
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
