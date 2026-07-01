import { defineRepoLocalSdlExtensionDescriptor, repoLocalSdlCommandDescriptor } from "sdl-sdk";

import { objectiveArchiveSdlCommand } from "./sdl/commands/archive.ts";
import { objectiveCheckSdlCommand } from "./sdl/commands/check.ts";
import { objectiveExecAutopilotLandSliceSdlCommand } from "./sdl/commands/exec-autopilot-land-slice.ts";
import { objectiveExecAutopilotPreflightSdlCommand } from "./sdl/commands/exec-autopilot-preflight.ts";
import { objectiveExecListCandidatesSdlCommand } from "./sdl/commands/exec-list-candidates.ts";
import { objectiveExecLoadOrientationsSdlCommand } from "./sdl/commands/exec-load-orientations.ts";
import { objectiveExecReadObjectiveSdlCommand } from "./sdl/commands/exec-read-objective.ts";
import { objectiveExecRunnerSubagentUsageSdlCommand } from "./sdl/commands/exec-runner-subagent-usage.ts";
import { objectiveExecTrackingGateSdlCommand } from "./sdl/commands/exec-tracking-gate.ts";
import { objectiveListSdlCommand } from "./sdl/commands/list.ts";

export const objectiveRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "objective",
	description: "Inspect and maintain SDL Objective records.",
	commands: [
		objectiveListSdlCommand,
		objectiveCheckSdlCommand,
		objectiveArchiveSdlCommand,
		objectiveExecAutopilotPreflightSdlCommand,
		objectiveExecAutopilotLandSliceSdlCommand,
		objectiveExecListCandidatesSdlCommand,
		objectiveExecLoadOrientationsSdlCommand,
		objectiveExecReadObjectiveSdlCommand,
		objectiveExecRunnerSubagentUsageSdlCommand,
		objectiveExecTrackingGateSdlCommand,
	].map((command) =>
		repoLocalSdlCommandDescriptor({
			command,
			packageExportPrefix: "@sdl/objective/sdl/commands",
		}),
	),
});
