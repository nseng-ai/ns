import { defineExtension } from "@nseng-ai/kernel/sdk";

import {
	initObjectives,
	initObjectivesRequestSchema,
	initObjectivesResultSchema,
	renderInitObjectivesHuman,
} from "../../init-objectives.ts";
import { nsInitCommand } from "../command.ts";

export const nsInitNsCommand = nsInitCommand({
	name: "init",
	summary: "Activate ns in this repository.",
	description:
		"Activate ns in this repository by writing ns.toml harness selection, managed instruction files, and .ns/objectives scaffolding.",
	schema: initObjectivesRequestSchema,
	options: { harness: { short: "-H" } },
	resultSchema: initObjectivesResultSchema,
	handler: (context, request) => initObjectives(context, { ...request, cwd: context.cwd }),
	renderHuman: renderInitObjectivesHuman,
});

export default defineExtension({
	commands: [nsInitNsCommand],
});
