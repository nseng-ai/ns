import { z } from "zod";

import {
	listExtensions,
	listExtensionsRequestSchema,
	listExtensionsResultSchema,
	renderListExtensionsHuman,
} from "../../list-extensions.ts";
import { nsInitCommand } from "../command.ts";

export const nsExtensionListCommand = nsInitCommand({
	name: "list",
	summary: "List declared ns extensions and their acquisition and artifact status.",
	description:
		"Inspect repository extension declarations and installed artifact state without acquiring packages or changing files.",
	schema: listExtensionsRequestSchema,
	resultSchema: listExtensionsResultSchema,
	failureSchema: z.any(),
	handler: (context, _request) => listExtensions(context, { cwd: context.cwd }),
	renderHuman: renderListExtensionsHuman,
});

export default nsExtensionListCommand;
