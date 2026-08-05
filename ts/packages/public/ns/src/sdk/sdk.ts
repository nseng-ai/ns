// Public author API for ns extensions.
export { defineCommand, defineExtension, defineRawCommand } from "@nseng-ai/sdk";
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
} from "@nseng-ai/sdk";
export type {
	ExecResult,
	NsConfirmOptions,
	NsConfirmPrompt,
	NsSelectPrompt,
	NsExecOptions,
	NsExtensionApi,
	NsOutputStream,
} from "@nseng-ai/sdk";
export { normalizeTextOutput, stripOuterCodeFence, trimOuterBlankLines } from "@nseng-ai/sdk";
export { truncateTextHead, truncateTextHeadTail } from "@nseng-ai/sdk";
export type { HeadTailTextTruncationOptions, HeadTextTruncationOptions } from "@nseng-ai/sdk";
export { failure, negative, ok, usageError } from "@nseng-ai/sdk";
export type { CommandOutcome as CommandExit } from "@nseng-ai/sdk";
export type {
	CommandOutcome,
	FailureOutcome,
	NegativeOutcome,
	SuccessOutcome,
	UsageErrorOutcome,
} from "@nseng-ai/sdk";
export {
	bundledArtifactDefinitionSchema,
	extensionDescriptorSchema,
	extensionPointAcceptsValues,
	extensionPointCardinalityValues,
	extensionPointDefinitionSchema,
	validateExtensionDescriptor,
} from "@nseng-ai/sdk";
export type {
	BundledArtifactDefinition,
	ExtensionActivation,
	ExtensionDescriptor,
	ExtensionDescriptorValidationResult,
	ExtensionPointDefinition,
} from "@nseng-ai/sdk";
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
} from "@nseng-ai/sdk";
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
} from "@nseng-ai/sdk";
export { z } from "@nseng-ai/sdk";
export type {
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerationUsage,
	TextGenerator,
} from "@nseng-ai/sdk";
