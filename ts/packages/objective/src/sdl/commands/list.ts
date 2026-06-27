import { resolveProcessCaps, type Caps, type RenderCapabilities } from "@sdl/clinkr";
import { defineExtension } from "sdl-sdk";

import { objectiveSdlCommand } from "../command.ts";
import {
	listObjectivesRequestSchema,
	objectiveListResultSchema,
	renderObjectiveListMarkdown,
	runListObjectives,
} from "../../operations/list-objectives.ts";
import { renderObjectiveListPretty } from "../../operations/list-objectives-pretty.ts";

// INTERIM bridge: the renderHuman seam only carries `canEmitAnsi` today, but the @sdl/clinkr/theme
// renderer needs a full `Caps` (colorDepth / columns / unicode). Until Caps is threaded through
// `emitExit` (a separate roadmap row), read columns/unicode/colorDepth from the live process and let
// the seam's `canEmitAnsi` gate color off (honoring NO_COLOR / a redirected pipe / --no-color).
function capsForHumanRender(renderCaps: RenderCapabilities): Caps {
	const base = resolveProcessCaps();
	return renderCaps.canEmitAnsi ? base : { ...base, colorDepth: "none" };
}

export const objectiveListSdlCommand = objectiveSdlCommand({
	name: "list",
	summary: "List Objective records in the current checkout.",
	description: "List Objective records in the current checkout.",
	schema: listObjectivesRequestSchema,
	resultSchema: objectiveListResultSchema,
	handler: runListObjectives,
	renderHuman: (data, caps) => renderObjectiveListPretty(data, capsForHumanRender(caps), Date.now()),
	renderMarkdown: renderObjectiveListMarkdown,
});

export default defineExtension({
	commands: [objectiveListSdlCommand],
});
