import {
	installExtension,
	installExtensionRequestSchema,
	installExtensionResultSchema,
	renderInstallExtensionHuman,
	renderInstallExtensionMarkdown,
} from "../../install-extension.ts";
import { nsInitCommand } from "../command.ts";

export const nsExtensionInstallCommand = nsInitCommand({
	name: "install",
	summary: "Install an ns extension at project or user scope.",
	description:
		"Install at project scope by default, or use --scope user to provision bundled skills into configured user harness roots and gate commands and points by the Active harness without project activation.",
	schema: installExtensionRequestSchema,
	options: { scope: { short: "-s" } },
	positionals: { source: { position: 0 } },
	resultSchema: installExtensionResultSchema,
	handler: (context, request) => installExtension(context, { ...request, cwd: context.cwd }),
	renderHuman: renderInstallExtensionHuman,
	renderMarkdown: renderInstallExtensionMarkdown,
});

export default nsExtensionInstallCommand;
