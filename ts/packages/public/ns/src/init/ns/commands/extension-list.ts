import {
	listExtensions,
	listExtensionsRequestSchema,
	listExtensionsResultSchema,
	renderListExtensionsHuman,
} from "../../list-extensions.ts";
import { nsInitCommand } from "../command.ts";

export const nsExtensionListCommand = nsInitCommand({
	name: "list",
	summary: "List installed and declared ns extensions at project or user scope.",
	description:
		"Use project scope by default, or use --scope user to inspect declarations, configured user harnesses, invocation-gated command availability, and bundled-skill reconciliation without changing files.",
	schema: listExtensionsRequestSchema,
	options: { scope: { short: "-s" } },
	resultSchema: listExtensionsResultSchema,
	handler: (context, request) => listExtensions(context, { ...request, cwd: context.cwd }),
	renderHuman: renderListExtensionsHuman,
});

export default nsExtensionListCommand;
