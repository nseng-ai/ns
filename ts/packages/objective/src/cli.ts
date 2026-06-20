#!/usr/bin/env node

import { ClinkrGroup } from "@asdl/clinkr";
import { defineCli } from "@asdl/core/cli-entry";

import { createRealObjectiveContext, type ObjectiveCliContext } from "./context.ts";
import {
	archiveObjectiveRequestSchema,
	archiveObjectiveResultSchema,
	renderArchiveObjective,
	runArchiveObjective,
} from "./operations/archive-objective.ts";
import {
	checkObjectiveRequestSchema,
	checkObjectiveResultSchema,
	renderCheckObjective,
	runCheckObjective,
} from "./operations/check-objective.ts";
import {
	listCandidatesRequestSchema,
	listCandidatesResultSchema,
	renderListCandidates,
	runListCandidates,
} from "./operations/list-candidates.ts";
import {
	listObjectivesRequestSchema,
	objectiveListResultSchema,
	renderObjectiveListHuman,
	renderObjectiveListMarkdown,
	runListObjectives,
} from "./operations/list-objectives.ts";
import {
	readObjectiveRequestSchema,
	readObjectiveResultSchema,
	renderReadObjective,
	runReadObjective,
} from "./operations/read-objective.ts";
import {
	renderRunnerSubagentUsageMarkdown,
	runnerSubagentUsageRequestSchema,
	runnerSubagentUsageResultSchema,
	runRunnerSubagentUsage,
} from "./operations/runner-subagent-usage.ts";

const entry = defineCli<ObjectiveCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Work with checked-in Objective records.",
	prepareRun: async ({ deps, cwd, env }) => {
		const context = deps.context ?? (await createRealObjectiveContext({ cwd, env }));
		return { type: "run", context, buildState: undefined };
	},
	configureCli: ({ root }) => {
		root.command({
			name: "archive",
			description: "Archive or unarchive an Objective record by moving its directory.",
			schema: archiveObjectiveRequestSchema,
			resultSchema: archiveObjectiveResultSchema,
			positionals: { slug: { position: 0 } },
			handler: runArchiveObjective,
			renderHuman: renderArchiveObjective,
		});
		root.command({
			name: "check",
			description: "Check one Objective record for required files and Markdown headings.",
			schema: checkObjectiveRequestSchema,
			resultSchema: checkObjectiveResultSchema,
			positionals: { slug: { position: 0 } },
			handler: runCheckObjective,
			renderHuman: renderCheckObjective,
		});
		root.command({
			name: "list",
			description: "List Objective records in the current checkout.",
			schema: listObjectivesRequestSchema,
			resultSchema: objectiveListResultSchema,
			handler: runListObjectives,
			renderHuman: renderObjectiveListHuman,
			renderMarkdown: renderObjectiveListMarkdown,
		});
		const execGroup = new ClinkrGroup<ObjectiveCliContext>({
			name: "exec",
			description: "Commands for use by objective skills.",
			isHidden: true,
		});
		execGroup.command({
			name: "list-candidates",
			description: "List active Objective slug candidates for shell and agent autocomplete.",
			schema: listCandidatesRequestSchema,
			resultSchema: listCandidatesResultSchema,
			handler: runListCandidates,
			renderHuman: renderListCandidates,
		});
		execGroup.command({
			name: "read-objective",
			description:
				"Read one Objective record by explicit slug as filesystem facts or raw Markdown.",
			schema: readObjectiveRequestSchema,
			resultSchema: readObjectiveResultSchema,
			positionals: { slug: { position: 0 } },
			handler: runReadObjective,
			renderHuman: renderReadObjective,
			renderMarkdown: renderReadObjective,
		});
		execGroup.command({
			name: "runner-subagent-usage",
			description:
				"Summarize Pi runner subagent JSONL usage telemetry for Objective stack digests.",
			schema: runnerSubagentUsageRequestSchema,
			resultSchema: runnerSubagentUsageResultSchema,
			positionals: { sessionFiles: { position: 0 } },
			handler: runRunnerSubagentUsage,
			renderHuman: renderRunnerSubagentUsageMarkdown,
			renderMarkdown: renderRunnerSubagentUsageMarkdown,
		});
		root.group(execGroup);
	},
});

export const VERSION = entry.version;

export interface CliDeps {
	context?: ObjectiveCliContext | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

export function buildCli(): ClinkrGroup<ObjectiveCliContext> {
	return entry.buildCli(undefined);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
