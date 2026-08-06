import {
	renderUpdateExtensionHuman,
	renderUpdateExtensionMarkdown,
	updateExtension,
	updateExtensionRequestSchema,
	updateExtensionResultSchema,
} from "../../update-extension.ts";
import { nsInitCommand } from "../command.ts";

export const nsExtensionUpdateCommand = nsInitCommand({
	name: "update",
	summary: "Update one declared ns extension at project or user scope.",
	description:
		"Update at project scope by default, or use --scope user to validate local sources, ensure or refresh npm sources, and reconcile bundled skills into configured user harness roots without project activation.",
	schema: updateExtensionRequestSchema,
	options: { dryRun: { short: "-n" }, scope: { short: "-s" } },
	positionals: { source: { position: 0 } },
	resultSchema: updateExtensionResultSchema,
	handler: (context, request) => updateExtension(context, { ...request, cwd: context.cwd }),
	renderHuman: renderUpdateExtensionHuman,
	renderMarkdown: renderUpdateExtensionMarkdown,
});

export default nsExtensionUpdateCommand;
