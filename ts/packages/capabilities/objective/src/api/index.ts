// Capability API (`@sdl/objective/api`): the curated, in-process surface that
// sibling consumers such as `ccc` and `sdlcc` depend on. It wraps the
// gateway-injected Domain Core (`ObjectiveCliContext`, which carries the git and
// storage gateways) and never exposes command-face (`ClinkrExit`) types.

import type { ObjectiveListResult } from "../core/operations/list-objectives.ts";

export { createObjectiveClient } from "../core/objective-api-client.ts";
export type {
	ObjectiveApiFailure,
	ObjectiveCandidate,
	ObjectiveCandidates,
	ObjectiveClient,
	ObjectiveClientOptions,
	ObjectiveListing,
	ObjectiveRead,
} from "../core/objective-api-client.ts";
export {
	chooseActiveObjectiveSlug,
	objectiveSelectionContextFromCommandContext,
} from "../core/objective-selection-flow.ts";
export type {
	ObjectiveSelectionCommandContext,
	ObjectiveSelectionCommandUi,
	ObjectiveSelectionContext,
	ObjectiveSelectionHost,
	ObjectiveSelectionListLoadResult,
	ObjectiveSelectionNotifyLevel,
	ObjectiveSelectionUi,
} from "../core/objective-selection-flow.ts";
export {
	VIEW_OTHER_OBJECTIVES_CHOICE,
	changedActiveObjectiveSelection,
	formatObjectiveChoice,
	objectiveChoiceMap,
	objectiveDiffPickerTitle,
	objectiveRecordsWithChangedFirst,
	parseObjectiveDiffChangedSlugs,
	parseObjectiveStatusChangedSlugs,
} from "../core/objective-picker.ts";
export type {
	ChangedActiveObjectiveSelectionOptions,
	ObjectiveDiffSelection,
} from "../core/objective-picker.ts";
export {
	buildObjectiveSkillPrompt,
	changedSelectionNotificationBasis,
} from "../core/objective-selection.ts";
export type {
	BuildObjectiveSkillPromptOptions,
	ObjectiveSelectionSpec,
	ObjectiveSkillPromptSpec,
} from "../core/objective-selection.ts";
export {
	completeObjectiveListArgs,
	parseObjectiveListArgTokens,
	parseObjectiveListArgs,
} from "../core/objective-cli-args.ts";
export type {
	ObjectiveListArgsParseResult,
	ObjectiveListParsedArgs,
} from "../core/objective-cli-args.ts";
export {
	objectiveCompletionItem,
	parseObjectiveCandidatesData,
} from "../core/objective-candidates.ts";
export type {
	ObjectiveCandidatesParseResult,
	ObjectiveCliCompletionItem,
} from "../core/objective-candidates.ts";
export {
	objectiveCommandSpecs,
	objectiveCreateCommandSpec,
} from "../core/objective-command-specs.ts";
export type {
	ObjectiveCommandSpec,
	ObjectiveCreateCommandSpec,
} from "../core/objective-command-specs.ts";
export { parseObjectiveListData } from "../core/objective-list-json.ts";
export type { ObjectiveListParseResult } from "../core/objective-list-json.ts";
export { renderObjectiveListMarkdown } from "../core/operations/list-objectives.ts";
export type {
	ObjectiveListRecord,
	ObjectiveListResult,
} from "../core/operations/list-objectives.ts";
export type { ReadObjectiveResult } from "../core/operations/read-objective.ts";
export type { ObjectiveCliContext } from "../core/context.ts";

export type ObjectiveList = ObjectiveListResult;
