// @ts-nocheck -- temporary descriptor-framework compatibility retained only for the additive filesystem cutover.
import { resolveRenderCapabilities } from "@nseng-ai/clinkr/legacy";
import { objectiveNsCommand } from "../command.ts";
import {
	listObjectivesRequestSchema,
	objectiveListResultSchema,
	renderObjectiveListMarkdown,
	runListObjectives,
} from "../../core/operations/list-objectives.ts";
import { renderObjectiveListPretty } from "../../core/operations/list-objectives-pretty.ts";

export const objectiveListNsCommand = objectiveNsCommand({
	name: "list",
	summary: "List Objective records in the current checkout.",
	description: "List Objective records in the current checkout.",
	schema: listObjectivesRequestSchema,
	options: { names: { short: "-n" }, status: { short: "-s" } },
	resultSchema: objectiveListResultSchema,
	handler: runListObjectives,
	renderHuman: (data, caps) =>
		renderObjectiveListPretty(data, resolveRenderCapabilities(caps), Date.now()),
	renderMarkdown: renderObjectiveListMarkdown,
});

export default objectiveListNsCommand;
