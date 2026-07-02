// Capability API (`@sdl/objective/api`): the curated, in-process surface that
// sibling consumers such as `ccc` and `sdlcc` depend on. It wraps the
// gateway-injected Domain Core (`ObjectiveCliContext`, which carries the git and
// storage gateways) and never exposes command-face (`ClinkrExit`) types.

import type { ObjectiveListResult } from "../operations/list-objectives.ts";

export { createObjectiveClient } from "./objective-api-client.ts";
export type {
	ObjectiveApiFailure,
	ObjectiveCandidate,
	ObjectiveCandidates,
	ObjectiveClient,
	ObjectiveClientOptions,
	ObjectiveListing,
	ObjectiveRead,
} from "./objective-api-client.ts";
export {
	chooseActiveObjectiveSlug,
	objectiveSelectionContextFromCommandContext,
} from "./objective-selection-flow.ts";
export type {
	ObjectiveSelectionCommandContext,
	ObjectiveSelectionCommandUi,
	ObjectiveSelectionContext,
	ObjectiveSelectionHost,
	ObjectiveSelectionListLoadResult,
	ObjectiveSelectionNotifyLevel,
	ObjectiveSelectionUi,
} from "./objective-selection-flow.ts";
export {
	VIEW_OTHER_OBJECTIVES_CHOICE,
	changedActiveObjectiveSelection,
	formatObjectiveChoice,
	objectiveChoiceMap,
	objectiveDiffPickerTitle,
	objectiveRecordsWithChangedFirst,
	parseObjectiveDiffChangedSlugs,
	parseObjectiveStatusChangedSlugs,
} from "./objective-picker.ts";
export type {
	ChangedActiveObjectiveSelectionOptions,
	ObjectiveDiffSelection,
} from "./objective-picker.ts";
export {
	buildObjectiveSkillPrompt,
	changedSelectionNotificationBasis,
} from "./objective-selection.ts";
export type {
	BuildObjectiveSkillPromptOptions,
	ObjectiveSelectionSpec,
	ObjectiveSkillPromptSpec,
} from "./objective-selection.ts";
export {
	completeObjectiveListArgs,
	parseObjectiveListArgTokens,
	parseObjectiveListArgs,
} from "./objective-cli-args.ts";
export type {
	ObjectiveListArgsParseResult,
	ObjectiveListParsedArgs,
} from "./objective-cli-args.ts";
export { objectiveCompletionItem, parseObjectiveCandidatesData } from "./objective-candidates.ts";
export type {
	ObjectiveCandidatesParseResult,
	ObjectiveCliCompletionItem,
} from "./objective-candidates.ts";
export { objectiveCommandSpecs, objectiveCreateCommandSpec } from "./objective-command-specs.ts";
export type {
	ObjectiveCommandSpec,
	ObjectiveCreateCommandSpec,
} from "./objective-command-specs.ts";
export { parseObjectiveListData } from "./objective-list-json.ts";
export type { ObjectiveListParseResult } from "./objective-list-json.ts";
export { renderObjectiveListMarkdown } from "../operations/list-objectives.ts";
export type { ObjectiveListRecord, ObjectiveListResult } from "../operations/list-objectives.ts";
export type { ReadObjectiveResult } from "../operations/read-objective.ts";
export type { ObjectiveCliContext } from "./context.ts";

export type ObjectiveList = ObjectiveListResult;
