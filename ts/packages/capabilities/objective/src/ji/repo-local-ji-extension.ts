import {
	defineRepoLocalSdlExtensionDescriptor,
	repoLocalSdlCommandDescriptor,
} from "@ji/kernel/sdk";

import { objectiveArchiveSdlCommand } from "./commands/archive.ts";
import { objectiveCheckSdlCommand } from "./commands/check.ts";
import { objectiveExecListCandidatesSdlCommand } from "./commands/exec-list-candidates.ts";
import { objectiveExecLoadOrientationsSdlCommand } from "./commands/exec-load-orientations.ts";
import { objectiveExecReadObjectiveSdlCommand } from "./commands/exec-read-objective.ts";
import { objectiveExecRunnerBeginSdlCommand } from "./commands/exec-runner-begin.ts";
import { objectiveExecRunnerFinishSdlCommand } from "./commands/exec-runner-finish.ts";
import { objectiveExecRunnerStepSdlCommand } from "./commands/exec-runner-step.ts";
import { objectiveExecRunnerSubagentUsageSdlCommand } from "./commands/exec-runner-subagent-usage.ts";
import { objectiveExecTrackingGateSdlCommand } from "./commands/exec-tracking-gate.ts";
import { objectiveListSdlCommand } from "./commands/list.ts";

export const objectiveRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "objective",
	description: "Inspect and maintain SDL Objective records.",
	commands: [
		objectiveListSdlCommand,
		objectiveCheckSdlCommand,
		objectiveArchiveSdlCommand,
		objectiveExecListCandidatesSdlCommand,
		objectiveExecLoadOrientationsSdlCommand,
		objectiveExecReadObjectiveSdlCommand,
		objectiveExecRunnerBeginSdlCommand,
		objectiveExecRunnerFinishSdlCommand,
		// ADR0024-LEGACY-DELETE(entry + its import above): legacy blocking command.
		objectiveExecRunnerStepSdlCommand,
		objectiveExecRunnerSubagentUsageSdlCommand,
		objectiveExecTrackingGateSdlCommand,
	].map((command) =>
		repoLocalSdlCommandDescriptor({
			command,
			packageExportPrefix: "@ji/objective/ji/commands",
		}),
	),
});
