import { defineExtension } from "@ns/kernel/sdk";

import { handoffNsCommand } from "../command.ts";
import {
	listRequestSchema,
	listResultSchema,
	renderList,
	renderListMarkdown,
	runList,
} from "../../core/operations/list.ts";

export const handoffListNsCommand = handoffNsCommand({
	name: "list",
	summary: "List handoffs.",
	description:
		"List handoffs. Defaults to the current branch. Pass --all to list across active branches or --include-deleted to include deleted local branches.",
	schema: listRequestSchema,
	options: { branch: { short: "-b" }, all: { short: "-a" }, includeDeleted: { short: "-d" } },
	resultSchema: listResultSchema,
	handler: runList,
	renderHuman: renderList,
	renderMarkdown: renderListMarkdown,
});

export default defineExtension({
	commands: [handoffListNsCommand],
});
