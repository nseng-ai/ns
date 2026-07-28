export {
	confirmInteractiveOrUsageError,
	createClinkrInteraction,
	requireInteractiveOrUsageError,
	resolveClinkrInteraction,
} from "./confirmation.ts";
export type {
	ClinkrInteraction,
	ConfirmationDefault,
	ConfirmationPromptFormatter,
	ConfirmationRequest,
	ConfirmationResult,
	ConfirmInteractiveOrUsageErrorOptions,
	CreateClinkrInteractionOptions,
	InteractiveConfirmationResult,
	ResolveClinkrInteractionOptions,
} from "./confirmation.ts";
export {
	DEFAULT_COLUMNS,
	readProcessCapsEnv,
	resolveCaps,
	resolveProcessCaps,
	resolveSettledNonInteractiveCaps,
} from "./caps.ts";
export type { Caps, CapsEnv, ColorDepth } from "./caps.ts";
export {
	completeClinkrWords,
	completeClinkrWordsAsync,
	renderClinkrCompletionScript,
	renderCompletionCandidatesNewline,
} from "./completion.ts";
export type {
	ClinkrCompletionCandidate,
	ClinkrCompletionCandidateType,
	ClinkrCompletionCommandPlan,
	ClinkrCompletionGroupPlan,
	ClinkrCompletionOptionPlan,
	ClinkrCompletionRequest,
	ClinkrCompletionResult,
	ClinkrCompletionShell,
	ClinkrDynamicCompletionProvider,
	ClinkrDynamicCompletionRequest,
	CompleteClinkrWordsAsyncOptions,
	RenderClinkrCompletionScriptOptions,
} from "./completion.ts";
export {
	ClinkrGroup,
	clinkrAutomaticAliasesForName,
	clinkrNameMatchesAutomaticAlias,
} from "./group.ts";
export type {
	ClinkrCommandSpec,
	ClinkrCompleteAsyncOptions,
	ClinkrGroupOptions,
	ClinkrHandler,
	ClinkrRunOptions,
	DefaultRawCommandSpec,
} from "./group.ts";
export { createProcessIo, resolveIo } from "./io.ts";
export type { ClinkrIo, ClinkrIoOverrides } from "./io.ts";
export type { OptionSpec, PositionalSpec } from "./surface.ts";
