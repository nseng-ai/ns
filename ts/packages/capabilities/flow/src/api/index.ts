// Capability API (`sdl-flow/api`): the curated, in-process surface for
// Flow workflow consumers. CCC imports this seam for Flow-owned behavior
// instead of importing private Flow internals directly.

export type {
	FlowAutobranchCheckpointInput,
	FlowAutobranchCheckpointResult,
	FlowAutobranchFileStat,
	FlowAutobranchRequest,
} from "./autobranch.ts";
export { createFlowAutobranchCheckpointFlow } from "./autobranch.ts";

export type { AutoslotCliInput, AutoslotFlowInput } from "../core/autoslot.ts";
export { createAutoslotFlow, runAutoslotCli } from "../core/autoslot.ts";

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

export type { TrunkPullOutcome, TrunkPullResult } from "../core/trunk-pull.ts";
export { runTrunkPullDetailed } from "../core/trunk-pull.ts";
