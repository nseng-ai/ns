import {
	readObjectiveRequestSchema,
	readObjectiveResultSchema,
	renderReadObjective,
	runReadObjective,
} from "../../../../core/operations/read-objective.ts";
import { objectiveNsCommand } from "../../../objective-command.ts";

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
