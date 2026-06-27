import { defineExtension } from "sdl-sdk";

import { handoffSdlCommand } from "../command.ts";
import {
	listRequestSchema,
	listResultSchema,
	renderList,
	renderListMarkdown,
	runList,
} from "../../operations/list.ts";

export const handoffListSdlCommand = handoffSdlCommand({
	name: "list",
	summary: "List handoffs.",
	description:
		"List handoffs. Defaults to the current branch. Pass --all to list across active branches or --include-deleted to include deleted local branches.",
	schema: listRequestSchema,
	resultSchema: listResultSchema,
	handler: runList,
	renderHuman: renderList,
	renderMarkdown: renderListMarkdown,
});

export default defineExtension({
	commands: [handoffListSdlCommand],
});
