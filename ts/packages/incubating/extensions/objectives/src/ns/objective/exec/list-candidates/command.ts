import { objectiveCommandMetadata, objectiveNsCommand } from "../../../objective-command.ts";
import {
	listCandidatesRequestSchema,
	listCandidatesResultSchema,
	renderListCandidates,
	runListCandidates,
} from "../../../../core/operations/list-candidates.ts";

export function metadata() {
	return objectiveCommandMetadata(
		"List active Objective slug candidates for shell and agent autocomplete.",
	);
}

export async function command() {
	return objectiveNsCommand({
		schema: listCandidatesRequestSchema,
		resultSchema: listCandidatesResultSchema,
		handler: runListCandidates,
		renderHuman: renderListCandidates,
	});
}
