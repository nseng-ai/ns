import { resolveRenderCapabilities } from "@nseng-ai/clinkr/legacy";

import {
	renderShowObjectiveHuman,
	renderShowObjectiveMarkdown,
	runShowObjective,
	showObjectiveRequestSchema,
	showObjectiveResultSchema,
} from "../../../core/operations/show-objective.ts";
import { objectiveNsCommand } from "../../../ns/objective-command.ts";

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
