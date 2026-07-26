import {
	listCandidatesRequestSchema,
	listCandidatesResultSchema,
	renderListCandidates,
	runListCandidates,
} from "../../../../core/operations/list-candidates.ts";
import { objectiveNsCommand } from "../../../../ns/objective-command.ts";

export async function command() {
	return objectiveNsCommand({
		schema: listCandidatesRequestSchema,
		resultSchema: listCandidatesResultSchema,
		handler: runListCandidates,
		renderHuman: renderListCandidates,
	});
}
