// Capability API (`@nseng-ai/flow/api`): the curated, in-process surface for
// Flow workflow consumers. Sibling capabilities import this seam for Flow-owned behavior
// instead of importing private Flow internals directly.

export type {
	FlowAutobranchCheckpointInput,
	FlowAutobranchCheckpointResult,
	FlowAutobranchFileStat,
	FlowAutobranchRequest,
} from "../autobranch/checkpoint-flow.ts";
export { createFlowAutobranchCheckpointFlow } from "../autobranch/checkpoint-flow.ts";

export type { AutoslotCliInput, AutoslotFlowInput } from "../autoslot/autoslot.ts";
export { createAutoslotFlow, runAutoslotCli } from "../autoslot/autoslot.ts";
export type {
	AutoslotDirectiveWriter,
	SlotCheckoutFailure,
	SlotCheckoutNavigationWarning,
	SlotCheckoutRef,
	SlotCheckoutResult,
	SlotCheckoutTarget,
} from "../autoslot/slot-checkout.ts";

export type {
	ExecResult,
	ExtensionMode,
	LandCliConfirmPrompt,
	LandCliInput,
	LandCommandContext,
	LandExtensionAPI,
	NotifyLevel,
	PrintOutput,
	ValidPullRequestView,
} from "../land/land.ts";
export { parsePullRequestView, registerLandCommand, runLandCli } from "../land/land.ts";
export { PR_FIELDS as FLOW_LAND_PR_FIELDS } from "../land/stack/constants.ts";

export { FLOW_SUBMIT_CHECK_FAILURE_MARKER } from "../submit/submit-hooks.ts";
export {
	FLOW_MINIMAL_SUBMIT_MAX_DIRTY_PATHS,
	type FlowMinimalSubmitClient,
	type FlowMinimalSubmitError,
	type FlowMinimalSubmitErrorCode,
	type FlowMinimalSubmitInput,
	type FlowMinimalSubmitMutationEvidence,
	type FlowMinimalSubmitMutationState,
	type FlowMinimalSubmitOutputEvent,
	type FlowMinimalSubmitPhaseEvent,
	type FlowMinimalSubmitPlan,
	type FlowMinimalSubmitPlanResult,
	type FlowMinimalSubmitResult,
	type FlowMinimalSubmitSource,
	type FlowMinimalSubmitStage,
} from "../submit/minimal-submit.ts";
export {
	createFlowMinimalSubmitClient,
	type CreateFlowMinimalSubmitClientOptions,
} from "../submit/real-minimal-submit.ts";

export type { TrunkPullOutcome, TrunkPullResult } from "../trunk-pull/trunk-pull.ts";
export { runTrunkPullDetailed } from "../trunk-pull/trunk-pull.ts";

export type {
	FlowBoundBranchPublicationTarget,
	FlowBranchPublicationClient,
	FlowPublicationError,
	PublishFlowBranchResult,
	ResolveFlowBranchPublicationTargetResult,
} from "../publication/branch-publication.ts";
export type { CreateFlowBranchPublicationClientOptions } from "../publication/real-publication-gateways.ts";
export { createFlowBranchPublicationClient } from "../publication/real-publication-gateways.ts";
