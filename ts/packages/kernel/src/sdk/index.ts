// Public author API for ns extensions.
// Keep ts/packages/kernel/docs/sdk-reference.md in sync when changing these exports.
export { defineCommand, defineExtension, defineRawCommand } from "./command.ts";
export type {
	ClinkrCompletionCandidate,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	ClinkrExit,
	ClinkrFormat,
	PositionalSpec,
	RenderCapabilities,
	DefineCommandSpec,
	KernelCommand,
	KernelCommandInvocation,
	NsCommand,
	NsCommandCompletionProvider,
	NsCommandRequest,
	NsCommandSchema,
	NsExtension,
} from "./command.ts";
export type {
	ExecResult,
	NsConfirmOptions,
	NsConfirmPrompt,
	NsExecOptions,
	NsExtensionApi,
	NsOutputStream,
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
export {
	buildMachineEnvelopeSchema,
	failure,
	machineEnvelopeSchema,
	negative,
	usageError,
} from "@nseng-ai/clinkr";
export type { MachineEnvelope } from "@nseng-ai/clinkr";
export {
	bundledArtifactDefinitionSchema,
	extensionDescriptorSchema,
	extensionPointAcceptsValues,
	extensionPointCardinalityValues,
	extensionPointDefinitionSchema,
	validateExtensionDescriptor,
	validateLoadedCommandName,
} from "./descriptor.ts";
export type {
	BundledArtifactDefinition,
	ExtensionCommandEntry,
	ExtensionDescriptor,
	ExtensionDescriptorValidationResult,
	ExtensionEntry,
	ExtensionGroupEntry,
	ExtensionPointDefinition,
	KernelCommandLoad,
	KernelCommandModule,
} from "./descriptor.ts";
export { failed, ok, okExit } from "./result.ts";
export type { NsResult } from "./result.ts";
export {
	centerMatrixProgressText,
	clampMatrixProgressLabelWidthChars,
	isMatrixProgressEvent,
	matrixProgressDisplayWidthChars,
	MATRIX_PROGRESS_MAX_LABEL_WIDTH_CHARS,
	MATRIX_PROGRESS_MIN_LABEL_WIDTH_CHARS,
	noopNsCommandIo,
	noopNsProgress,
	padMatrixProgressTextEnd,
} from "./services.ts";
export type {
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
