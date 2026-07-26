import {
	readObjectiveRequestSchema,
	readObjectiveResultSchema,
	renderReadObjective,
	runReadObjective,
} from "../../../../core/objective-read.ts";
import { objectiveNsCommand } from "../../../../ns/objective-command.ts";

export async function command() {
	return objectiveNsCommand({
		schema: readObjectiveRequestSchema,
		resultSchema: readObjectiveResultSchema,
		negativeSchema: readObjectiveResultSchema,
		positionals: { slug: { position: 0 } },
		handler: runReadObjective,
		renderHuman: renderReadObjective,
		renderMarkdown: renderReadObjective,
	});
}
