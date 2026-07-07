import {
	defineRepoLocalNsExtensionDescriptor,
	repoLocalNsCommandDescriptor,
} from "@nseng-ai/kernel/sdk";

import { objectiveCheckNsCommand } from "./commands/check.ts";
import { objectiveExecListCandidatesNsCommand } from "./commands/exec-list-candidates.ts";
import { objectiveExecLoadOrientationsNsCommand } from "./commands/exec-load-orientations.ts";
import { objectiveExecReadObjectiveNsCommand } from "./commands/exec-read-objective.ts";
import { objectiveExecRunnerBeginNsCommand } from "./commands/exec-runner-begin.ts";
import { objectiveExecRunnerFinishNsCommand } from "./commands/exec-runner-finish.ts";
import { objectiveExecRunnerSubagentUsageNsCommand } from "./commands/exec-runner-subagent-usage.ts";
import { objectiveExecTrackingGateNsCommand } from "./commands/exec-tracking-gate.ts";
import { objectiveListNsCommand } from "./commands/list.ts";
import { objectiveShowNsCommand } from "./commands/show.ts";

export const objectiveRepoLocalNsExtension = defineRepoLocalNsExtensionDescriptor({
	group: "objective",
	description: "Inspect and maintain ns Objective records.",
	commands: [
		objectiveListNsCommand,
		objectiveShowNsCommand,
		objectiveCheckNsCommand,
		objectiveExecListCandidatesNsCommand,
		objectiveExecLoadOrientationsNsCommand,
		objectiveExecReadObjectiveNsCommand,
		objectiveExecRunnerBeginNsCommand,
		objectiveExecRunnerFinishNsCommand,
		objectiveExecRunnerSubagentUsageNsCommand,
		objectiveExecTrackingGateNsCommand,
	].map((command) =>
		repoLocalNsCommandDescriptor({
			command,
			packageExportPrefix: "@nseng-ai/objectives/ns/commands",
		}),
	),
});
