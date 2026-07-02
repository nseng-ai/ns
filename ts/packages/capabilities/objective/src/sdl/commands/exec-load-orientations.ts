import { defineExtension } from "@sdl/kernel/sdk";

import { objectiveSdlCommand } from "../command.ts";
import {
	loadOrientationsRequestSchema,
	loadOrientationsResultSchema,
	renderLoadOrientationsMarkdown,
	runLoadOrientations,
} from "../../operations/load-orientations.ts";

export const objectiveExecLoadOrientationsSdlCommand = objectiveSdlCommand({
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
	commands: [objectiveExecLoadOrientationsSdlCommand],
});
