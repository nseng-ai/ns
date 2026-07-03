// Capability API (`@ns/flow/api`): the curated, in-process surface for
// Flow workflow consumers. CCC imports this seam for Flow-owned behavior
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

export type { TrunkPullOutcome, TrunkPullResult } from "../trunk-pull/trunk-pull.ts";
export { runTrunkPullDetailed } from "../trunk-pull/trunk-pull.ts";
