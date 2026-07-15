// Capability API (`@nseng-ai/flow/api`): the curated, in-process surface for
// Flow workflow consumers. The cmux capability imports this seam for Flow-owned behavior
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
export type {
	FlowMinimalSubmitClient,
	FlowMinimalSubmitError,
	FlowMinimalSubmitMutationEvidence,
	FlowMinimalSubmitMutationState,
	FlowMinimalSubmitOutputEvent,
	FlowMinimalSubmitPhaseEvent,
	FlowMinimalSubmitPlan,
	FlowMinimalSubmitPlanResult,
	FlowMinimalSubmitResult,
	FlowMinimalSubmitSource,
	FlowMinimalSubmitStage,
} from "../submit/minimal-submit.ts";
export type { CreateFlowMinimalSubmitClientOptions } from "../submit/real-minimal-submit.ts";
export { createFlowMinimalSubmitClient } from "../submit/real-minimal-submit.ts";

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
