import { objectiveNsCommand } from "../../../objective-command.ts";
import {
	listCandidatesRequestSchema,
	listCandidatesResultSchema,
	renderListCandidates,
	runListCandidates,
} from "../../../../core/operations/list-candidates.ts";

export async function command() {
	return objectiveNsCommand({
		schema: listCandidatesRequestSchema,
		resultSchema: listCandidatesResultSchema,
		handler: runListCandidates,
		renderHuman: renderListCandidates,
	});
}
