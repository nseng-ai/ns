export { type GithubRepositoryIdentity } from "@ns/capability-kit/github";

export {
	deriveStatus,
	type StackViewCheckBucket,
	type StackViewCheckEntry,
	type StackViewModel,
	type StackViewPr,
	type StackViewPrChecks,
	type StackViewPrStatus,
	type StackViewPrThreads,
	type StackViewStatusInput,
	type StackViewThreadDetail,
} from "./types.ts";

export { loadStackView, type LoadStackViewParams, type LoadStackViewResult } from "./data.ts";

export { renderPlainSnapshot, buildSummaryPrompt } from "./render.ts";

export {
	buildStackDetailRows,
	buildStackIdentityLine,
	buildStackRollupSegments,
	formatStackRowCells,
	rollupBucketForPr,
	sliceStackDetailLinesForViewport,
	stackListRows,
	wrapStackDetailLines,
	STACK_OVERLAY_MARGIN,
	STACK_OVERLAY_MAX_HEIGHT_RATIO,
	type StackDetailRole,
	type StackDetailRow,
	type StackDetailViewport,
	type StackDetailViewportOptions,
	type StackRollupBucket,
	type StackRollupSegment,
	type StackRowCells,
} from "./overlay-model.ts";

export {
	buildStackPrQuery,
	fetchRepoIdentity,
	fetchStackPrs,
	graphiteUrl,
	parseStackPrResponse,
	type FetchRepoIdentityParams,
	type FetchRepoIdentityResult,
	type FetchStackPrsParams,
	type FetchStackPrsResult,
	type StackPrData,
	type StackPrParseResult,
} from "./graphql.ts";

export {
	objectiveSlugsForBranch,
	objectiveSlugsFromDiffOutput,
	type ObjectiveSlugsForBranchParams,
	type ObjectiveSlugsResult,
} from "./objectives.ts";

export {
	runStackViewOverlayUi,
	StackViewOverlay,
	type StackViewOverlayUiContext,
	type StackViewOverlayUiOptions,
	type StackViewUiOutcome,
	type StackViewUiResult,
} from "./overlay-ui.ts";
