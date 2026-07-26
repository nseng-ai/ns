import {
	loadOrientationsRequestSchema,
	loadOrientationsResultSchema,
	renderLoadOrientationsMarkdown,
	runLoadOrientations,
} from "../../../../core/operations/load-orientations.ts";
import { objectiveNsCommand } from "../../../objective-command.ts";

export async function command() {
	return objectiveNsCommand({
		schema: loadOrientationsRequestSchema,
		resultSchema: loadOrientationsResultSchema,
		handler: runLoadOrientations,
		renderHuman: renderLoadOrientationsMarkdown,
		renderMarkdown: renderLoadOrientationsMarkdown,
	});
}
