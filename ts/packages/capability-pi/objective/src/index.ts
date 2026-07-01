export { default, objectiveParity } from "./extension.ts";
export {
	VIEW_OTHER_OBJECTIVES_CHOICE,
	buildObjectiveSkillPrompt,
	changedActiveObjectiveSelection,
	chooseActiveObjectiveSlug,
	formatObjectiveChoice,
	objectiveChoiceMap,
	objectiveDiffPickerTitle,
	objectiveRecordsWithChangedFirst,
	objectiveSelectionContextFromCommandContext,
	parseObjectiveDiffChangedSlugs,
	parseObjectiveStatusChangedSlugs,
} from "@sdl/objective/api";
export type {
	BuildObjectiveSkillPromptOptions,
	ChangedActiveObjectiveSelectionOptions,
	ObjectiveDiffSelection,
	ObjectiveSelectionContext,
	ObjectiveSelectionHost,
	ObjectiveSelectionListLoadResult,
	ObjectiveSelectionNotifyLevel,
	ObjectiveSelectionSpec,
	ObjectiveSelectionUi,
	ObjectiveSkillPromptSpec,
} from "@sdl/objective/api";
