import { defineExtension } from "@ns/kernel/sdk";

import { objectiveNsCommand } from "../command.ts";
import {
	loadOrientationsRequestSchema,
	loadOrientationsResultSchema,
	renderLoadOrientationsMarkdown,
	runLoadOrientations,
} from "../../core/operations/load-orientations.ts";

export const objectiveExecLoadOrientationsNsCommand = objectiveNsCommand({
	name: "exec-load-orientations",
	summary: "Load active Objective orientation files for agent onboarding.",
	description: "Load active Objective orientation files for agent onboarding.",
	schema: loadOrientationsRequestSchema,
	resultSchema: loadOrientationsResultSchema,
	handler: runLoadOrientations,
	renderHuman: renderLoadOrientationsMarkdown,
	renderMarkdown: renderLoadOrientationsMarkdown,
});

export default defineExtension({
	commands: [objectiveExecLoadOrientationsNsCommand],
});
