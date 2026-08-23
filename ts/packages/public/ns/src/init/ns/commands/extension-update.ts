import { z } from "zod";

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
	summary: "Update and reactivate one declared ns extension.",
	description:
		"Refresh one floating npm extension, repair one pinned npm extension, or reactivate one local extension without changing ns.toml.",
	schema: updateExtensionRequestSchema,
	options: { dryRun: { short: "-n" } },
	positionals: { source: { position: 0 } },
	resultSchema: updateExtensionResultSchema,
	failureSchema: z.any(),
	usageErrorSchema: z.any(),
	handler: (context, request) => updateExtension(context, { ...request, cwd: context.cwd }),
	renderHuman: renderUpdateExtensionHuman,
	renderMarkdown: renderUpdateExtensionMarkdown,
});

export default nsExtensionUpdateCommand;
