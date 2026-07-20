// Capability API (`@nseng-ai/objectives/api`): the curated, in-process surface that
// sibling workflow capabilities depend on. It wraps the
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
	objectiveSelectionHostFromExec,
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
	objectiveChangedSlugsFromPaths,
	objectiveDiffPickerTitle,
	objectiveRecordsWithChangedFirst,
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
	isObjectiveListStatus,
	OBJECTIVE_LIST_STATUS_VALUES,
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
	allObjectiveCreateCommandSpecs,
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
	ObjectiveStatusFilter,
} from "../core/operations/list-objectives.ts";
export type {
	ReadObjectiveOptions,
	ReadObjectiveResult,
} from "../core/operations/read-objective.ts";
export type { ObjectiveCliContext } from "../core/context.ts";
export {
	objectiveRunnerCumulativeSummaryV1Schema,
	objectiveRunnerPublicationAuthorizationV1Schema,
	objectiveRunnerPublicationCheckpointSchema,
	objectiveRunnerPublicationLaunchAttestationV1Schema,
	objectiveRunnerPublicationTargetSchema,
	objectiveRunnerPublishedStepSchema,
	objectiveRunnerTrackingCommitSchema,
	objectiveRunnerValidationOutcomeSchema,
	publicationCommitFactsSchema,
	publicationTargetFactsSchema,
} from "../publication/contracts.ts";
export type {
	ObjectiveRunnerCumulativeSummaryV1,
	ObjectiveRunnerPublicationAuthorizationV1,
	ObjectiveRunnerPublicationCheckpoint,
	ObjectiveRunnerPublicationLaunchAttestationV1,
	PublicationCommitFacts,
	PublicationTargetFacts,
} from "../publication/contracts.ts";
export {
	bindObjectiveRunnerPublication,
	recheckObjectiveRunnerPublication,
} from "../publication/authorization.ts";
export type {
	BindObjectiveRunnerPublicationOptions,
	PublicationAuthorizationRefusalCode,
	PublicationAuthorizationResult,
	RecheckedObjectiveRunnerPublication,
	RecheckObjectiveRunnerPublicationOptions,
} from "../publication/authorization.ts";
export type {
	ObjectiveRunnerPublicationFactsGateway,
	PublicationFactsError,
	PublicationFactsResult,
	PublicationTargetFactsResult,
} from "../publication/facts-gateway.ts";
export { createObjectiveRunnerBranchPublisher } from "../publication/flow-branch-publisher.ts";
export {
	publishObjectiveRunnerCheckpoint,
	type ObjectiveRunnerBoundPublicationTarget,
	type ObjectiveRunnerBranchPublisher,
	type ObjectiveRunnerBranchPublisherResult,
	type ObjectiveRunnerPublicationError,
	type PublishObjectiveRunnerCheckpointOptions,
	type PublishObjectiveRunnerCheckpointResult,
} from "../publication/publish.ts";
export { renderObjectiveRunnerCumulativeSummary } from "../publication/summary.ts";

export type ObjectiveList = ObjectiveListResult;
