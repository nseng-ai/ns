import { defineExtension } from "sdl-sdk";

import { objectiveSdlCommand } from "../command.ts";
import {
	autopilotLandSliceRequestSchema,
	autopilotLandSliceResultSchema,
	renderAutopilotLandSlice,
	runAutopilotLandSlice,
} from "../../operations/autopilot/land-slice.ts";

export const objectiveExecAutopilotLandSliceSdlCommand = objectiveSdlCommand({
	name: "exec-autopilot-land-slice",
	summary:
		"Verify live repo state, then commit a finished slice via Graphite (gt) and optionally submit.",
	description:
		"Verify live repo state on a Graphite-tracked branch, then commit the finished slice with " +
		"`gt modify` (falling back to `git commit`) and optionally open a stacked PR via " +
		"`sdl flow submit --no-restack`. Requires Graphite; refuses to commit on trunk or an untracked branch.",
	schema: autopilotLandSliceRequestSchema,
	resultSchema: autopilotLandSliceResultSchema,
	positionals: { slug: { position: 0 } },
	handler: runAutopilotLandSlice,
	renderHuman: renderAutopilotLandSlice,
	renderMarkdown: renderAutopilotLandSlice,
});

export default defineExtension({
	commands: [objectiveExecAutopilotLandSliceSdlCommand],
});
