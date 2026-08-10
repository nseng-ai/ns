// Public author API for ns extensions.
export { defineCommand, defineExtension, defineRawCommand } from "./command.ts";
export type {
	ClinkrCompletionCandidate,
	ClinkrCompletionProviderRequest,
	DefineCommandSpec,
	NsCommand,
	NsCommandCompletionCandidate,
	NsCommandCompletionProvider,
	NsCommandCompletionRequest,
	NsCommandCompletionResult,
	NsCommandRequest,
	NsCommandSchema,
	NsRawCommandDefinition,
	NsRawCommandOptions,
	OptionSpec,
	PositionalSpec,
	RenderCapabilities,
} from "./command.ts";
export type { ConfirmationResult, SelectionResult } from "@nseng-ai/clinkr";
export type {
	ExecResult,
	NsConfirmOptions,
	NsConfirmPrompt,
	NsSelectPrompt,
	NsExecOptions,
	NsExtensionApi,
	NsOutputStream,
	NsRenderCapabilities,
	NsResultOutput,
} from "./execution.ts";
export {
	normalizeTextOutput,
	stripOuterCodeFence,
	trimOuterBlankLines,
} from "@nseng-ai/foundation/text-normalization";
export { truncateTextHead, truncateTextHeadTail } from "@nseng-ai/foundation/text-truncation";
export type {
	HeadTailTextTruncationOptions,
	HeadTextTruncationOptions,
} from "@nseng-ai/foundation/text-truncation";
export { failure, negative, ok, usageError } from "./result.ts";
export type { CommandOutcome as CommandExit } from "./result.ts";
export type {
	CommandOutcome,
	FailureOutcome,
	NegativeOutcome,
	SuccessOutcome,
	UsageErrorOutcome,
} from "./result.ts";
export {
	extensionDescriptorSchema,
	extensionPointAcceptsValues,
	extensionPointCardinalityValues,
	extensionPointDefinitionSchema,
	validateExtensionDescriptor,
} from "./descriptor.ts";
export type {
	ExtensionActivation,
	ExtensionDescriptor,
	ExtensionDescriptorValidationResult,
	ExtensionPointDefinition,
} from "./descriptor.ts";
export {
	centerMatrixProgressText,
	clampMatrixProgressLabelWidthChars,
	formatActiveOperation,
	formatActiveOperationsLine,
	isMatrixProgressEvent,
	matrixProgressDisplayWidthChars,
	MATRIX_PROGRESS_MAX_LABEL_WIDTH_CHARS,
	MATRIX_PROGRESS_MIN_LABEL_WIDTH_CHARS,
	noopNsCommandIo,
	noopNsProgress,
	padMatrixProgressTextEnd,
} from "./services.ts";
export type {
	ActiveOperation,
	NsCommandIo,
	NsCommandMessageOptions,
	NsNotifyLevel,
	NsProgress,
	NsProgressMatrixCellState,
	NsProgressMatrixColumnInfo,
	NsProgressMatrixEvent,
	NsProgressMatrixRowInfo,
	NsProgressPhaseEvent,
	NsProgressPhaseInfo,
	NsProgressPhaseListener,
} from "./services.ts";
export { z } from "./schema.ts";
export type {
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerationUsage,
	TextGenerator,
} from "./text-generation.ts";
