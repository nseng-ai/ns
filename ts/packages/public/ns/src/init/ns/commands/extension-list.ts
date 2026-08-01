import {
	listExtensions,
	listExtensionsRequestSchema,
	listExtensionsResultSchema,
	renderListExtensionsHuman,
} from "../../list-extensions.ts";
import { nsInitCommand } from "../command.ts";

export const nsExtensionListCommand = nsInitCommand({
	name: "list",
	summary: "List installed and declared ns extensions and their status.",
	description:
		"Inspect installed package extensions, repository declarations, and artifact state without acquiring packages or changing files.",
	schema: listExtensionsRequestSchema,
	resultSchema: listExtensionsResultSchema,
	handler: (context, _request) => listExtensions(context, { cwd: context.cwd }),
	renderHuman: renderListExtensionsHuman,
});

export default nsExtensionListCommand;
