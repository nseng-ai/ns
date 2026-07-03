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
	summary: "Check one Objective record, or sweep all record edges with --all.",
	description:
		"Check one Objective record for required files, Markdown headings, and Record Frontmatter edge/blocked structure. With --all, sweep every record's Record Frontmatter across the active and archive roots and report structural edge/blocked violations.",
	schema: checkObjectiveRequestSchema,
	resultSchema: checkObjectiveResultSchema,
	positionals: { slug: { position: 0 } },
	options: { all: { short: "-a" } },
	handler: runCheckObjective,
	renderHuman: renderCheckObjective,
});

export default defineExtension({
	commands: [objectiveCheckSdlCommand],
});
