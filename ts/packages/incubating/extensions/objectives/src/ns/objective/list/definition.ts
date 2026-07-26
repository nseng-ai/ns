import { resolveRenderCapabilities } from "@nseng-ai/clinkr";
import { objectiveNsCommand } from "../../objective-command.ts";
import {
	listObjectivesRequestSchema,
	objectiveListResultSchema,
	renderObjectiveListMarkdown,
	runListObjectives,
} from "../../../core/operations/list-objectives.ts";
import { renderObjectiveListPretty } from "../../../core/operations/list-objectives-pretty.ts";

export async function command() {
	return objectiveNsCommand({
		schema: listObjectivesRequestSchema,
		options: { names: { short: "-n" }, status: { short: "-s" } },
		resultSchema: objectiveListResultSchema,
		handler: runListObjectives,
		renderHuman: (data, caps) =>
			renderObjectiveListPretty(data, resolveRenderCapabilities(caps), Date.now()),
		renderMarkdown: renderObjectiveListMarkdown,
	});
}
