import { resolveRenderCapabilities } from "@sdl/clinkr";
import { defineExtension } from "sdl-sdk";

import { objectiveSdlCommand } from "../command.ts";
import {
	listObjectivesRequestSchema,
	objectiveListResultSchema,
	renderObjectiveListMarkdown,
	runListObjectives,
} from "../../operations/list-objectives.ts";
import { renderObjectiveListPretty } from "../../operations/list-objectives-pretty.ts";

export const objectiveListSdlCommand = objectiveSdlCommand({
	name: "list",
	summary: "List Objective records in the current checkout.",
	description: "List Objective records in the current checkout.",
	schema: listObjectivesRequestSchema,
	resultSchema: objectiveListResultSchema,
	handler: runListObjectives,
	renderHuman: (data, caps) =>
		renderObjectiveListPretty(data, resolveRenderCapabilities(caps), Date.now()),
	renderMarkdown: renderObjectiveListMarkdown,
});

export default defineExtension({
	commands: [objectiveListSdlCommand],
});
