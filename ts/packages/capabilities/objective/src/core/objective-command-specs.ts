import type { ObjectiveSelectionSpec } from "./objective-selection.ts";

export type ObjectiveCliSubcommand = "next" | "update" | "close" | "stack-impl";
export type ObjectiveCommandName = `ns:objective:${ObjectiveCliSubcommand}`;
export type ObjectiveSkillName = `objective-${ObjectiveCliSubcommand}`;
export type ObjectiveCreateCommandName = "ns:objective:create";
export type ObjectiveCreateSkillName = "objective-create";

export interface ObjectiveCommandSpec extends ObjectiveSelectionSpec {
	commandName: ObjectiveCommandName;
	skillName: ObjectiveSkillName;
	cliSubcommand: ObjectiveCliSubcommand;
	description: string;
	fallbackPrompt: string;
	actionPrompt: string;
	postSelectionReminder?: string;
}

export interface ObjectiveCreateCommandSpec {
	commandName: ObjectiveCreateCommandName;
	skillName: ObjectiveCreateSkillName;
	description: string;
	actionPrompt: string;
}

type ObjectiveCommandSpecInput = Omit<ObjectiveCommandSpec, "commandName" | "statusKey">;

export const OBJECTIVE_CREATE_COMMAND_NAME: ObjectiveCreateCommandName = "ns:objective:create";

function objectiveCommandName(cliSubcommand: ObjectiveCliSubcommand): ObjectiveCommandName {
	return `ns:objective:${cliSubcommand}`;
}

function defineObjectiveCommandSpec(spec: ObjectiveCommandSpecInput): ObjectiveCommandSpec {
	const commandName = objectiveCommandName(spec.cliSubcommand);
	return {
		...spec,
		commandName,
		statusKey: commandName,
	};
}

export const objectiveCreateCommandSpec: ObjectiveCreateCommandSpec = {
	commandName: OBJECTIVE_CREATE_COMMAND_NAME,
	skillName: "objective-create",
	description:
		"Read objective-create backing Markdown to interview for and create a new Objective.",
	actionPrompt: "Run objective-create with this initial user request:",
};

export const objectiveCommandSpecs: ObjectiveCommandSpec[] = [
	defineObjectiveCommandSpec({
		skillName: "objective-next",
		cliSubcommand: "next",
		description:
			"Pick an active Objective, then invoke objective-next to recommend, steer planning, or offer confirmed execution when Objective policy allows it.",
		selectionTitle: "Select an active Objective for next work or execution preview",
		fallbackPrompt:
			"The objective-next skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway for the explicit Objective below: apply the Tracking Gate, auto-run objective-update before continuing when clear current-branch or worktree progress for this same Objective is missing from tracking, recommend the next useful work, and include a best-effort work-left estimate as semantic steps or slices, not calendar time. Estimate either until Objective completion or, when the remaining path is unclear, until the next discovery or decision step where additional work can be identified. Only offer execution when the Objective contains explicit Runner Policy / Definition of Progress prose allowing it. If execution is offered, present an upfront preview and wait for explicit confirmation before material action. Do not use hidden ledgers, task files, private queues, Branch Memory run state, or alternate Objective stores. Do not submit PRs or perform external side effects unless included in the confirmed preview scope.",
		actionPrompt: "Run objective-next for this explicitly selected Objective slug or path:",
		postSelectionReminder:
			"\nThis explicit objective-next invocation preauthorizes update-and-continue when the Tracking Gate finds clear material current-branch or worktree progress for this same Objective that is absent from Objective tracking: run objective-update for this selected Objective, reread the Objective and repo evidence, reapply the gate, then continue. Ask before updating only when evidence, Objective fit, or update scope is ambiguous.",
		shouldCompactDiffSuggestion: true,
	}),
	defineObjectiveCommandSpec({
		skillName: "objective-update",
		cliSubcommand: "update",
		description: "Pick an active Objective, then invoke objective-update for the selected slug.",
		selectionTitle: "Select an active Objective to update",
		fallbackPrompt:
			"The objective-update skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: update tracking for exactly one explicit Objective below.",
		actionPrompt: "Run objective-update for this explicitly selected Objective slug or path:",
		postSelectionReminder:
			"\nAfter this explicit selection, follow objective-update's normal post-selection evidence workflow.",
	}),
	defineObjectiveCommandSpec({
		skillName: "objective-close",
		cliSubcommand: "close",
		description: "Pick an active Objective, then invoke objective-close for the selected slug.",
		selectionTitle: "Select an active Objective to close",
		fallbackPrompt:
			"The objective-close skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: close exactly one explicit Objective below only after confirming the closure outcome/rationale, then add ## Closure and closed.md without archiving, deleting, moving, or reopening the Objective.",
		actionPrompt: "Run objective-close for this explicitly selected Objective slug or path:",
		postSelectionReminder:
			"\nAfter this explicit selection, follow objective-close's normal closure confirmation workflow before mutating Objective files.",
	}),
	defineObjectiveCommandSpec({
		skillName: "objective-stack-impl",
		cliSubcommand: "stack-impl",
		description:
			"Pick an active Objective, then invoke the portable Objective stack implementation skill for the selected slug.",
		selectionTitle: "Select an active Objective for stack implementation",
		fallbackPrompt:
			"The objective-stack-impl skill was not found among loaded Pi skills. Follow the repository's Objective stack implementation workflow anyway: orchestrate implementation of one explicit Objective as a small Graphite stack from this session. Require user confirmation before execution, run at most one runner subagent at a time, record Objective updates for material progress, and do not submit PRs automatically.",
		actionPrompt: "Run objective-stack-impl for this explicitly selected Objective slug or path:",
		shouldCompactDiffSuggestion: true,
	}),
];
