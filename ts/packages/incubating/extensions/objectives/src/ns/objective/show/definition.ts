import { resolveRenderCapabilities } from "@nseng-ai/clinkr";
import { objectiveNsCommand } from "../../objective-command.ts";
import {
	renderShowObjectiveHuman,
	renderShowObjectiveMarkdown,
	runShowObjective,
	showObjectiveRequestSchema,
	showObjectiveResultSchema,
} from "../../../core/operations/show-objective.ts";

export async function command() {
	return objectiveNsCommand({
		schema: showObjectiveRequestSchema,
		resultSchema: showObjectiveResultSchema,
		positionals: { slug: { position: 0 } },
		handler: runShowObjective,
		renderHuman: (data, caps) =>
			renderShowObjectiveHuman(data, resolveRenderCapabilities(caps), Date.now()),
		renderMarkdown: renderShowObjectiveMarkdown,
	});
}
