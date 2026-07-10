import {
	installExtension,
	installExtensionRequestSchema,
	installExtensionResultSchema,
	renderInstallExtensionHuman,
} from "../../install-extension.ts";
import { nsInitCommand } from "../command.ts";

export const nsExtensionInstallCommand = nsInitCommand({
	name: "install",
	summary: "Install and activate an ns extension.",
	description:
		"Install an npm or local ns extension, record it in ns.toml, and activate its declared artifacts for the project's configured harnesses.",
	schema: installExtensionRequestSchema,
	positionals: { source: { position: 0 } },
	resultSchema: installExtensionResultSchema,
	handler: (context, request) => installExtension(context, { ...request, cwd: context.cwd }),
	renderHuman: renderInstallExtensionHuman,
});

export default nsExtensionInstallCommand;
