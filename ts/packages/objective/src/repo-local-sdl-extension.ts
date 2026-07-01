import { defineRepoLocalSdlExtensionDescriptor } from "sdl-sdk";

import { objectiveArchiveSdlCommand } from "./sdl/commands/archive.ts";
import { objectiveCheckSdlCommand } from "./sdl/commands/check.ts";
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
		{
			command: objectiveListSdlCommand,
			manifestEntry: "./src/commands/list.ts",
			packageExport: "@sdl/objective/sdl/commands/list",
		},
		{
			command: objectiveCheckSdlCommand,
			manifestEntry: "./src/commands/check.ts",
			packageExport: "@sdl/objective/sdl/commands/check",
		},
		{
			command: objectiveArchiveSdlCommand,
			manifestEntry: "./src/commands/archive.ts",
			packageExport: "@sdl/objective/sdl/commands/archive",
		},
		{
			command: objectiveExecListCandidatesSdlCommand,
			manifestEntry: "./src/commands/exec-list-candidates.ts",
			packageExport: "@sdl/objective/sdl/commands/exec-list-candidates",
		},
		{
			command: objectiveExecLoadOrientationsSdlCommand,
			manifestEntry: "./src/commands/exec-load-orientations.ts",
			packageExport: "@sdl/objective/sdl/commands/exec-load-orientations",
		},
		{
			command: objectiveExecReadObjectiveSdlCommand,
			manifestEntry: "./src/commands/exec-read-objective.ts",
			packageExport: "@sdl/objective/sdl/commands/exec-read-objective",
		},
		{
			command: objectiveExecRunnerSubagentUsageSdlCommand,
			manifestEntry: "./src/commands/exec-runner-subagent-usage.ts",
			packageExport: "@sdl/objective/sdl/commands/exec-runner-subagent-usage",
		},
		{
			command: objectiveExecTrackingGateSdlCommand,
			manifestEntry: "./src/commands/exec-tracking-gate.ts",
			packageExport: "@sdl/objective/sdl/commands/exec-tracking-gate",
		},
	],
});
