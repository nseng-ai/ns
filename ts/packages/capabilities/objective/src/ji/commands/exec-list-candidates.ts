import { defineExtension } from "@ji/kernel/sdk";

import { objectiveSdlCommand } from "../command.ts";
import {
	listCandidatesRequestSchema,
	listCandidatesResultSchema,
	renderListCandidates,
	runListCandidates,
} from "../../core/operations/list-candidates.ts";

export const objectiveExecListCandidatesSdlCommand = objectiveSdlCommand({
	name: "exec-list-candidates",
	summary: "List active Objective slug candidates for shell and agent autocomplete.",
	description: "List active Objective slug candidates for shell and agent autocomplete.",
	schema: listCandidatesRequestSchema,
	resultSchema: listCandidatesResultSchema,
	handler: runListCandidates,
	renderHuman: renderListCandidates,
});

export default defineExtension({
	commands: [objectiveExecListCandidatesSdlCommand],
});
