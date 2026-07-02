// Capability API (`sdl-flow/api`): the curated, in-process surface for
// Flow workflow consumers. CCC imports this seam for Flow-owned behavior
// instead of importing private Flow internals directly.

export type {
	FlowAutobranchCheckpointInput,
	FlowAutobranchCheckpointResult,
	FlowAutobranchFileStat,
	FlowAutobranchRequest,
} from "./api/autobranch.ts";
export { createFlowAutobranchCheckpointFlow } from "./api/autobranch.ts";

export type { AutoslotCliInput, AutoslotFlowInput } from "./autoslot.ts";
export { createAutoslotFlow, runAutoslotCli } from "./autoslot.ts";

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
} from "./land.ts";
export { parsePullRequestView, registerLandCommand, runLandCli } from "./land.ts";

export type { TrunkPullOutcome, TrunkPullResult } from "./trunk-pull.ts";
export { runTrunkPullDetailed } from "./trunk-pull.ts";
