import type { ObjectiveDiffSelection } from "./objective-picker.ts";

export type ObjectiveSelectionMode = "compact-diff-suggestion" | "advancement";

export interface ObjectiveSelectionSpec {
	statusKey: string;
	selectionTitle: string;
	selectionMode?: ObjectiveSelectionMode;
}

export interface ObjectiveSkillPromptSpec {
	fallbackPrompt: string;
	actionPrompt: string;
}

export interface BuildObjectiveSkillPromptOptions {
	spec: ObjectiveSkillPromptSpec;
	skillBlock: string | undefined;
	objective: string;
	postSelectionReminder?: string;
}

export function buildObjectiveSkillPrompt(options: BuildObjectiveSkillPromptOptions): string {
	const { spec, skillBlock, objective, postSelectionReminder = "" } = options;
	return `${skillBlock ?? spec.fallbackPrompt}

${spec.actionPrompt}

\`\`\`text
${objective}
\`\`\`

Treat this as an explicit user selection. Do not auto-select a different Objective.${postSelectionReminder}`;
}

export function changedSelectionNotificationBasis(selection: ObjectiveDiffSelection): string {
	const committedDiffLabel = selection.trunkBranch ? `changed vs ${selection.trunkBranch}` : "";
	if (selection.changeBasisLabel === committedDiffLabel) {
		return `from objective diff vs ${selection.trunkBranch}`;
	}

	return `with changes ${selection.changeBasisLabel.replace(/^changed\s+/, "")}`;
}
