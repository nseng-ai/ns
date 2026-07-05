import type { PreinstalledNsCommandCatalogEntry } from "@ns/kernel/cli";

const OBJECTIVE_PACKAGE_EXPORT_PREFIX = "@ns/objective/ns/commands";
const OBJECTIVE_GROUP = "objective";
const OBJECTIVE_GROUP_DESCRIPTION = "Inspect and maintain ns Objective records.";

const objectivePreinstalledCommands = [
	{
		name: "list",
		description: "List Objective records in the current checkout.",
	},
	{
		name: "check",
		description: "Check one Objective record, or sweep all record edges with --all.",
	},
	{
		name: "archive",
		description: "Archive or unarchive an Objective record by moving its directory.",
	},
	{
		name: "exec-list-candidates",
		description: "List active Objective slug candidates for shell and agent autocomplete.",
	},
	{
		name: "exec-load-orientations",
		description: "Load active Objective orientation files for agent onboarding.",
	},
	{
		name: "exec-read-objective",
		description: "Read one Objective record by explicit slug as filesystem facts or raw Markdown.",
	},
	{
		name: "exec-runner-begin",
		description:
			"Check preconditions and emit step facts plus the subagent prompt for one decomposed Objective Runner step (ADR 0024).",
	},
	{
		name: "exec-runner-finish",
		description:
			"Validate the subagent report, run the verification gate, create the runner-owned commit, and emit the Runner Checkpoint for one decomposed Objective Runner step (ADR 0024).",
	},
	{
		name: "exec-runner-step",
		description:
			"Run one verified Objective implementation step through a dispatched child session and emit the Runner Checkpoint.",
	},
	{
		name: "exec-runner-subagent-usage",
		description: "Summarize Pi runner subagent JSONL usage telemetry for Objective stack digests.",
	},
	{
		name: "exec-tracking-gate",
		description: "Collect deterministic Objective tracking gate evidence for one slug.",
	},
] as const satisfies readonly {
	readonly name: string;
	readonly description: string;
}[];

export const objectivePreinstalledNsCommandCatalog = objectivePreinstalledCommands.map(
	(command) => ({
		group: OBJECTIVE_GROUP,
		groupDescription: OBJECTIVE_GROUP_DESCRIPTION,
		name: command.name,
		description: command.description,
		fullDescription: command.description,
		moduleSpecifier: `${OBJECTIVE_PACKAGE_EXPORT_PREFIX}/${command.name}`,
	}),
) satisfies readonly PreinstalledNsCommandCatalogEntry[];

export function listObjectivePreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return objectivePreinstalledNsCommandCatalog;
}
