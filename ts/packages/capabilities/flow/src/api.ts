// Capability API (`sdl-flow/api`): the curated, in-process surface for
// Flow workflow consumers. CCC imports this seam for Flow-owned behavior
// instead of importing private Flow internals directly.
//
// Export classification:
// - Stable Flow Capability API: cohesive Flow operations and request/result
//   vocabulary needed by in-process consumers such as CCC.
// - Transitional compatibility groups: existing CCC land-stack wrappers are
//   routed through this seam while Flow keeps implementation modules private
//   from the package export map.
// - Not exported here: command-loader entries (`sdl-flow/commands/*`) or new
//   neutral SDK/core surfaces for Flow-owned product policy.

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
	PrintOutput,
	ValidPullRequestView,
} from "./land.ts";
export { parsePullRequestView, registerLandCommand, runLandCli } from "./land.ts";

export type { TrunkPullOutcome, TrunkPullResult } from "./trunk-pull.ts";
export { runTrunkPullDetailed } from "./trunk-pull.ts";

export type { ExecuteStackLandingOptions } from "./land-stack.ts";
export {
	executeStackLanding,
	landArgumentCompletions,
	parseArgs,
	registerLandStackRenderer,
} from "./land-stack.ts";

export type { DetectWorktreeConflictsOptions } from "./land-stack/worktrees.ts";
export {
	detectWorktreeConflicts,
	formatConflict,
	formatManualWorktreeConflict,
	formatSlotConflict,
	isManagedSlotPath,
	loadWorktrees,
	normalizeExistingPath,
	parseWorktreeList,
	slotNameFromPath,
} from "./land-stack/worktrees.ts";

export type {
	AutocompleteItem,
	BranchPlan,
	CommandStreamFinish,
	CommandStreamMessageDetails,
	CommandStreamPrLink,
	CustomMessage,
	CustomMessageContent,
	DescendantMaintenancePlan,
	LandedChunk,
	LandedPr,
	LandingPlan,
	LandingShape,
	LandingWarning,
	LandResultKind,
	LandStackCommandContext,
	LandStackExtensionAPI,
	MessageRenderer,
	NotifyLevel,
	ParsedArgs,
	PrSubmitRequirement,
	PullRequestSnapshot,
	RemainingCleanup,
	RenderComponent,
	RenderTheme,
	RestackRequirement,
	RetainedLocalBranchCleanup,
	StackSnapshot,
	WorktreeConflict,
	WorktreeEntry,
} from "./land-stack/types.ts";

export {
	assertCleanRepo,
	assertLocalBranchExists,
	detectInProgressOperation,
	firstNonEmptyLine,
	loadCurrentBranch,
	loadLandingShape,
	loadLiveLocalBranches,
	loadLocalSha,
	loadRepoRoot,
	loadStackSnapshot,
	loadTrunk,
	resolveGitPath,
} from "./land-stack/stack-facts.ts";
export type {
	DetectInProgressOperationOptions,
	LoadStackSnapshotOptions,
} from "./land-stack/stack-facts.ts";

export {
	formatChunkedPlan,
	formatChunkedSuccessSummary,
	formatFailedTarget,
	formatFailure,
	formatFailureNotification,
	formatLandingWarning,
	formatPlan,
	formatRestackFailureMessage,
	formatSubmitFailureMessage,
	formatSuccessNotification,
	formatSuccessSummary,
	indentLines,
	landFailureKind,
	present,
	presentBrief,
	setStatus,
	usage,
} from "./land-stack/presentation.ts";
export type { FormatSuccessNotificationOptions } from "./land-stack/presentation.ts";

export {
	collectPrSubmitRequirements,
	formatPrSubmitRequirement,
	loadPr,
	validateInitialPrPreflight,
	validateOpenPrBasics,
	validateStrictMergeGate,
} from "./land-stack/pr-facts.ts";

export {
	buildLandingPlan,
	collectSubmitRestackRequirements,
	landingParentEdges,
	localBranchRef,
	restackForSubmitArgs,
	restackTargetForSubmit,
	scopeStackSnapshot,
	submitUpdateArgs,
} from "./land-stack/landing-plan.ts";

export {
	confirmAndFreeManagedSlots,
	confirmAndSubmitRequiredPrUpdates,
	formatSubmitUpdateDetails,
	prepareMergeLoopState,
	residualPreMergeFailure,
	runMergeLoop,
} from "./land-stack/landing-operations.ts";
export type {
	MergeLoopState,
	PreMergeConfirmation,
	PrepareMergeLoopStateOptions,
	RunMergeLoopOptions,
} from "./land-stack/landing-operations.ts";

export {
	deriveDescendantSubtree,
	derivePathToTrunk,
	detectForkViolations,
	formatForkViolations,
	loadGraphiteTopology,
	resolveMetadataDbPath,
} from "./land-stack/graphite-topology.ts";
export type {
	DerivePathToTrunkOptions,
	ForkViolation,
	GraphiteTopology,
} from "./land-stack/graphite-topology.ts";

export {
	completed,
	emptyResult,
	failure,
	isFailure,
	landStackFailure,
	success,
} from "./land-stack/errors.ts";
export type {
	LandStackFailure,
	LandStackFailureOptions,
	LandStackOutcome,
	LandStackResult,
} from "./land-stack/errors.ts";

export {
	renderLandResultBlock,
	renderLandResultBlockFromMessage,
} from "./land-stack/land-presentation.ts";
export type { LandResultBlock, LandResultMessageBlock } from "./land-stack/land-presentation.ts";

export {
	AUTO_CHUNK_LANDING_SIZE,
	AUTO_CHUNK_LANDING_THRESHOLD,
	BACKUP_REF_NAMESPACE,
	BACKUP_REF_PREV_NAMESPACE,
	COMMAND_NAME,
	COMMAND_STREAM_MESSAGE_TYPE,
	GH_MERGE_TIMEOUT_MS,
	GH_TIMEOUT_MS,
	GIT_TIMEOUT_MS,
	GT_MUTATION_TIMEOUT_MS,
	GT_TIMEOUT_MS,
	MAX_COMMAND_STREAM_OUTPUT_LINES,
	MAX_OUTPUT_TAIL_CHARS,
	MAX_OUTPUT_TAIL_LINES,
	PR_FIELDS,
	SLOT_TIMEOUT_MS,
	SQLITE_TIMEOUT_MS,
	STATUS_KEY,
} from "./land-stack/constants.ts";

export { LAND_BACKUP_RECOVERY_HINT, writeLandBackupRefs } from "./land-stack/backup-refs.ts";

export {
	commandStreamDetailsForLanded,
	commandStreamLineColor,
	createLandUiCommandIo,
	formatCommandForDisplay,
	formatCommandStreamBlock,
	LandStackCommandStream,
	renderCommandStreamLine,
	renderCommandStreamMessage,
	withCommandStreaming,
} from "./land-stack/command-stream.ts";

export type {
	CheckedOutElsewhere,
	ExecGraphiteOptions,
	ExecOptions,
} from "./land-stack/command-exec.ts";
export {
	commandStreamOutputLines,
	exec,
	execGraphite,
	execRaw,
	execRawGraphite,
	formatCommandDetails,
	isGtDeleteMissingBranch,
	normalizeCommandFinish,
	outputTail,
	parseGitCheckedOutElsewhere,
	shortSha,
	stripAnsi,
} from "./land-stack/command-exec.ts";
