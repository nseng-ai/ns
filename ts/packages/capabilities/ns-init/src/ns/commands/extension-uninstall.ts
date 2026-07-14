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
	summary: "Uninstall and deactivate an ns extension.",
	description:
		"Remove an npm or local ns extension declaration, deactivate its managed artifacts, preserve consumer data, and clean up managed npm bytes.",
	schema: uninstallExtensionRequestSchema,
	positionals: { source: { position: 0 } },
	resultSchema: uninstallExtensionResultSchema,
	handler: (context, request) => uninstallExtension(context, { ...request, cwd: context.cwd }),
	renderHuman: renderUninstallExtensionHuman,
	renderMarkdown: renderUninstallExtensionMarkdown,
});

export default nsExtensionUninstallCommand;
