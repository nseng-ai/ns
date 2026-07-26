import { objectiveCommandMetadata, objectiveNsCommand } from "../../../objective-command.ts";
import {
	loadOrientationsRequestSchema,
	loadOrientationsResultSchema,
	renderLoadOrientationsMarkdown,
	runLoadOrientations,
} from "../../../../core/operations/load-orientations.ts";

export function metadata() {
	return objectiveCommandMetadata("Load active Objective orientation files for agent onboarding.");
}

export async function command() {
	return objectiveNsCommand({
		schema: loadOrientationsRequestSchema,
		resultSchema: loadOrientationsResultSchema,
		handler: runLoadOrientations,
		renderHuman: renderLoadOrientationsMarkdown,
		renderMarkdown: renderLoadOrientationsMarkdown,
	});
}
