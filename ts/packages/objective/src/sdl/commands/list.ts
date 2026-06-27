import { defineExtension } from "sdl-sdk";

import { objectiveSdlCommand } from "../command.ts";
import {
	listObjectivesRequestSchema,
	objectiveListResultSchema,
	renderObjectiveListHuman,
	renderObjectiveListMarkdown,
	runListObjectives,
} from "../../operations/list-objectives.ts";

export const objectiveListSdlCommand = objectiveSdlCommand({
	name: "list",
	summary: "List Objective records in the current checkout.",
	description: "List Objective records in the current checkout.",
	schema: listObjectivesRequestSchema,
	resultSchema: objectiveListResultSchema,
	handler: runListObjectives,
	renderHuman: renderObjectiveListHuman,
	renderMarkdown: renderObjectiveListMarkdown,
});

export default defineExtension({
	commands: [objectiveListSdlCommand],
});
