import { specializedCommandBackedSkillsFromSpecs } from "@nseng-ai/foundation/command";

import type { ObjectiveSelectionSpec } from "./objective-selection.ts";

export type ObjectiveCliSubcommand = "next" | "update" | "close" | "autorun";
export type ObjectiveCommandName = `ns:objective:${ObjectiveCliSubcommand}`;
export type ObjectiveSkillName = `objective-${ObjectiveCliSubcommand}`;
export type ObjectiveCreateCommandName = "ns:objective:create";
export type ObjectiveCreateSkillName = "objective-create";

export interface ObjectiveCommandSpec extends ObjectiveSelectionSpec {
	commandName: ObjectiveCommandName;
	skillName: ObjectiveSkillName;
	cliSubcommand: ObjectiveCliSubcommand;
	description: string;
	actionPrompt: string;
	postSelectionReminder?: string;
}

export interface ObjectiveCreateSkillSpec {
	description: string;
	actionPrompt: string;
}

export type ObjectiveCreateCommandSpec = ObjectiveCreateSkillSpec & {
	commandName: ObjectiveCreateCommandName;
	skillName: ObjectiveCreateSkillName;
};

type ObjectiveCommandSpecInput = Omit<ObjectiveCommandSpec, "commandName" | "statusKey">;

export const OBJECTIVE_CREATE_COMMAND_NAME: ObjectiveCreateCommandName = "ns:objective:create";

function objectiveCommandName(cliSubcommand: ObjectiveCliSubcommand): ObjectiveCommandName {
	return `ns:objective:${cliSubcommand}`;
}

function deriveSpec<TInput extends object, TDerived extends object>(
	spec: TInput,
	derive: (spec: TInput) => TDerived,
): TInput & TDerived {
	return {
		...spec,
		...derive(spec),
	};
}

function defineObjectiveCommandSpec(spec: ObjectiveCommandSpecInput): ObjectiveCommandSpec {
	return deriveSpec(spec, ({ cliSubcommand }) => {
		const commandName = objectiveCommandName(cliSubcommand);
		return {
			commandName,
			statusKey: commandName,
		};
	});
}

export const objectiveCreateCommandSpec: ObjectiveCreateCommandSpec = {
	commandName: OBJECTIVE_CREATE_COMMAND_NAME,
	skillName: "objective-create",
	description:
		"Read objective-create backing Markdown to interview for and create a new Objective. Objective patterns are offered during the interview.",
	actionPrompt: "Run objective-create with this initial user request:",
};

/** Every command spec that expands an Objective-creation backing skill. */
export const allObjectiveCreateCommandSpecs: ObjectiveCreateCommandSpec[] = [
	objectiveCreateCommandSpec,
];

export const objectiveCommandSpecs: ObjectiveCommandSpec[] = [
	defineObjectiveCommandSpec({
		skillName: "objective-next",
		cliSubcommand: "next",
		description:
			"Pick an active Objective, then invoke objective-next to recommend, steer planning, or offer confirmed execution when Objective policy allows it.",
		selectionTitle: "Select an active Objective for next work or execution preview",
		actionPrompt: "Run objective-next for this explicitly selected Objective slug or path:",
		postSelectionReminder:
			"\nThis explicit objective-next invocation preauthorizes update-and-continue when the Tracking Gate finds clear material current-branch or worktree progress for this same Objective that is absent from Objective tracking: run objective-update for this selected Objective, reread the Objective and repo evidence, reapply the gate, then continue. Ask before updating only when evidence, Objective fit, or update scope is ambiguous.",
		selectionMode: "advancement",
	}),
	defineObjectiveCommandSpec({
		skillName: "objective-update",
		cliSubcommand: "update",
		description: "Pick an active Objective, then invoke objective-update for the selected slug.",
		selectionTitle: "Select an active Objective to update",
		actionPrompt: "Run objective-update for this explicitly selected Objective slug or path:",
		postSelectionReminder:
			"\nAfter this explicit selection, follow objective-update's normal post-selection evidence workflow.",
	}),
	defineObjectiveCommandSpec({
		skillName: "objective-close",
		cliSubcommand: "close",
		description: "Pick an active Objective, then invoke objective-close for the selected slug.",
		selectionTitle: "Select an active Objective to close",
		actionPrompt: "Run objective-close for this explicitly selected Objective slug or path:",
		postSelectionReminder:
			"\nAfter this explicit selection, follow objective-close's normal closure confirmation and connected-Objective propagation workflow before mutating Objective files.",
	}),
	defineObjectiveCommandSpec({
		skillName: "objective-autorun",
		cliSubcommand: "autorun",
		description:
			"Pick an active Objective, then invoke objective-autorun to drive it through repeated verified runner steps.",
		selectionTitle: "Select an active Objective to autorun",
		actionPrompt:
			"Run objective-autorun with this Objective selection and launch scope (slug/path plus optional scope, step budget, and standing guidance):",
		selectionMode: "advancement",
	}),
];

export const objectiveCommandBackedSkillRegistrations = specializedCommandBackedSkillsFromSpecs(
	[...allObjectiveCreateCommandSpecs, ...objectiveCommandSpecs].map((spec) => ({
		skillName: spec.skillName,
		surface: spec.commandName,
	})),
);
