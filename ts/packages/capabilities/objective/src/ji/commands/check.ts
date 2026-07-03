import { defineExtension } from "@ji/kernel/sdk";

import { objectiveSdlCommand } from "../command.ts";
import {
	checkObjectiveRequestSchema,
	checkObjectiveResultSchema,
	renderCheckObjective,
	runCheckObjective,
} from "../../core/operations/check-objective.ts";

export const objectiveCheckSdlCommand = objectiveSdlCommand({
	name: "check",
	summary: "Check one Objective record for required files and Markdown headings.",
	description: "Check one Objective record for required files and Markdown headings.",
	schema: checkObjectiveRequestSchema,
	resultSchema: checkObjectiveResultSchema,
	positionals: { slug: { position: 0 } },
	handler: runCheckObjective,
	renderHuman: renderCheckObjective,
});

export default defineExtension({
	commands: [objectiveCheckSdlCommand],
});
