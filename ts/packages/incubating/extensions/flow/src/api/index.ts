// Extension API (`@nseng-ai/flow/api`): the curated, in-process surface for
// Flow workflow consumers. Sibling extensions import this seam for Flow-owned behavior
// instead of importing private Flow internals directly.

export type {
	FlowAutobranchCheckpointInput,
	FlowAutobranchCheckpointResult,
	FlowAutobranchFileStat,
	FlowAutobranchRequest,
} from "../autobranch/checkpoint-flow.ts";
export { createFlowAutobranchCheckpointFlow } from "../autobranch/checkpoint-flow.ts";

export type { AutoslotFlowInput, AutoslotWorkflowResult } from "../autoslot/autoslot.ts";
export { createAutoslotFlow } from "../autoslot/autoslot.ts";

export type {
	ExecResult,
	ExtensionMode,
	FlowLandWorkflowResult,
	LandCommandContext,
	LandConfirmPrompt,
	LandSelectPrompt,
	NotifyLevel,
	PrintOutput,
	RunLandWorkflowInput,
	ValidPullRequestView,
} from "../land/land.ts";
export { parsePullRequestView, runLandWorkflow } from "../land/land.ts";
export { PR_FIELDS as FLOW_LAND_PR_FIELDS } from "../land/stack/constants.ts";

export { FLOW_SUBMIT_CHECK_FAILURE_MARKER } from "../submit/submit-hooks.ts";

export type { FlowCommandProvider, FlowCommandSpec } from "./command-surfaces.ts";
export {
	FLOW_COMMAND_SPECS,
	FLOW_SUBMIT_COMMAND_SPEC,
	flowSkillBackedCommandRegistrations,
} from "./command-surfaces.ts";

export type {
	FlowSubmitCheckRecoveryResult,
	FlowSubmitRecoveryContext,
	FlowSubmitRecoveryGitGateway,
	ResolveFlowSubmitCheckRecoveryOptions,
} from "./submit-check-recovery.ts";
export {
	nodeFlowSubmitRecoveryContext,
	resolveFlowSubmitCheckRecovery,
} from "./submit-check-recovery.ts";

export type { FlowStackSquashPresentation, RunFlowStackSquashOptions } from "./stack-squash.ts";
export { runFlowStackSquash } from "./stack-squash.ts";

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
