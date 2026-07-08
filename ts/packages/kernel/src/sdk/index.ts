// Public author API for ns extensions.
// Keep ts/packages/kernel/docs/sdk-reference.md in sync when changing these exports.
export {
	defineCommand,
	defineExtension,
	defineParsedCommand,
	defineRawCommand,
} from "./command.ts";
export type {
	ClinkrCompletionCandidate,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	ClinkrFormat,
	PositionalSpec,
	RenderCapabilities,
	DefineCommandSpec,
	ParsedKernelCommandSpec,
	KernelCommand,
	KernelCommandCompletionCandidate,
	KernelCommandCompletionProvider,
	KernelCommandCompletionRequest,
	KernelCommandCompletionResult,
	KernelCommandInvocation,
	KernelCommandSpec,
	NsCommand,
	NsCommandCompletionProvider,
	NsCommandRequest,
	NsCommandSchema,
	NsExtension,
	OptionSpec,
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
	buildFailureMachineEnvelopeSchema,
	buildMachineEnvelopeSchema,
	buildSuccessMachineEnvelopeSchema,
	failure,
	machineEnvelopeSchema,
	negative,
	ok,
	toMachineEnvelope,
	usageError,
} from "./result.ts";
export type {
	BuildFailureMachineEnvelopeSchemaOptions,
	CommandExit,
	FailureCommandExit,
	MachineEnvelope,
	NegativeCommandExit,
	NegativeCommandExitOptions,
	OkCommandExit,
	UsageErrorCommandExit,
} from "./result.ts";
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
	DescriptorCommand,
	ExtensionCommandEntry,
	ExtensionDescriptor,
	ExtensionDescriptorValidationResult,
	ExtensionEntry,
	ExtensionGroupEntry,
	ExtensionPointDefinition,
	KernelCommandLoad,
	KernelCommandModule,
} from "./descriptor.ts";
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
