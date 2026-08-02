import {
	renderUninstallExtensionHuman,
	renderUninstallExtensionMarkdown,
	uninstallExtension,
	uninstallExtensionRequestSchema,
	uninstallExtensionResultSchema,
} from "../../uninstall-extension.ts";
import { nsInitCommand } from "../command.ts";

export const nsExtensionUninstallCommand = nsInitCommand({
	name: "uninstall",
	summary: "Uninstall an ns extension at project or user scope.",
	description:
		"Uninstall at project scope by default, or use --scope user to remove only a local command-availability declaration while preserving source bytes.",
	schema: uninstallExtensionRequestSchema,
	options: { scope: { short: "-s" } },
	positionals: { source: { position: 0 } },
	resultSchema: uninstallExtensionResultSchema,
	handler: (context, request) => uninstallExtension(context, { ...request, cwd: context.cwd }),
	renderHuman: renderUninstallExtensionHuman,
	renderMarkdown: renderUninstallExtensionMarkdown,
});

export default nsExtensionUninstallCommand;
