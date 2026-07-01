import { defineExtension } from "sdl-sdk";

import { objectiveSdlCommand } from "../command.ts";
import {
	autopilotPreflightRequestSchema,
	autopilotPreflightResultSchema,
	renderAutopilotPreflight,
	runAutopilotPreflight,
} from "../../operations/autopilot/preflight.ts";

export const objectiveExecAutopilotPreflightSdlCommand = objectiveSdlCommand({
	name: "exec-autopilot-preflight",
	summary: "Check live repo/Objective state before an autopilot run.",
	description: "Check live repo/Objective state before an autopilot run.",
	schema: autopilotPreflightRequestSchema,
	resultSchema: autopilotPreflightResultSchema,
	positionals: { slug: { position: 0 } },
	handler: runAutopilotPreflight,
	renderHuman: renderAutopilotPreflight,
	renderMarkdown: renderAutopilotPreflight,
});

export default defineExtension({
	commands: [objectiveExecAutopilotPreflightSdlCommand],
});
