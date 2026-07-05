import { defineExtension } from "@ns/kernel/sdk";

import { objectiveNsCommand } from "../command.ts";
import {
	archiveObjectiveRequestSchema,
	archiveObjectiveResultSchema,
	renderArchiveObjective,
	runArchiveObjective,
} from "../../core/operations/archive-objective.ts";

export const objectiveArchiveNsCommand = objectiveNsCommand({
	name: "archive",
	summary: "Archive or unarchive an Objective record by moving its directory.",
	description: "Archive or unarchive an Objective record by moving its directory.",
	schema: archiveObjectiveRequestSchema,
	options: { unarchive: { short: "-u" } },
	resultSchema: archiveObjectiveResultSchema,
	positionals: { slug: { position: 0 } },
	handler: runArchiveObjective,
	renderHuman: renderArchiveObjective,
});

export default defineExtension({
	commands: [objectiveArchiveNsCommand],
});
