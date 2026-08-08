import {
	composeNsExtensionPointCommands,
	NS_BUILT_IN_HELP_GROUP,
	type PreinstalledNsCommandSource,
} from "@nseng-ai/sdk/cli";

export const preinstalledCommandSources = [
	{
		label: "host:@nseng-ai/ns:init",
		kind: "built-in",
		origin: "host",
		helpClassification: "built-in",
		compose: (root) => {
			root.command(
				"init",
				{
					description:
						"Activate ns in this repository by writing ns.toml, generating agent instructions, and creating declared consumer directories.",
					helpGroup: NS_BUILT_IN_HELP_GROUP,
				},
				async () => {
					const { command } = await import("../init/ns/cli/init/command.ts");
					return command();
				},
			);
			root.group(
				"extension",
				{
					description: "Inspect and manage ns extensions.",
					helpGroup: NS_BUILT_IN_HELP_GROUP,
				},
				(extension) => {
					extension.command(
						"install",
						{ description: "Install and activate an ns extension." },
						async () => {
							const { command } = await import("../init/ns/cli/extension/install/command.ts");
							return command();
						},
					);
					extension.command(
						"list",
						{ description: "List installed and declared ns extensions." },
						async () => {
							const { command } = await import("../init/ns/cli/extension/list/command.ts");
							return command();
						},
					);
					extension.command(
						"uninstall",
						{ description: "Uninstall and deactivate an ns extension." },
						async () => {
							const { command } = await import("../init/ns/cli/extension/uninstall/command.ts");
							return command();
						},
					);
					extension.command(
						"update",
						{ description: "Update one declared ns extension." },
						async () => {
							const { command } = await import("../init/ns/cli/extension/update/command.ts");
							return command();
						},
					);
					composeNsExtensionPointCommands(extension);
				},
			);
		},
		package: {
			name: "@nseng-ai/ns",
			version: "0.1.4",
			descriptorPath: "@nseng-ai/ns/init/ns-extension",
		},
	},
] as const satisfies readonly PreinstalledNsCommandSource[];

export function loadPreinstalledNsCommandSources(): readonly PreinstalledNsCommandSource[] {
	return preinstalledCommandSources;
}
