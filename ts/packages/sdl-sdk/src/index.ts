// Public author API for SDL extensions.
// Keep ts/packages/kernel/docs/sdk-reference.md in sync when changing these exports.
export { defineExtension } from "./command.ts";
export type {
	ClinkrCompletionCandidate,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	ClinkrExit,
	PositionalSpec,
	RenderCapabilities,
	SdlCommand,
	SdlCommandCompletionProvider,
	SdlCommandRequest,
	SdlCommandSchema,
	SdlExtension,
} from "./command.ts";
export {
	commandSucceeded,
	formatCommand,
	formatCommandDetails,
	formatCommandError,
	formatCommandEvidence,
	withTemporaryFile,
} from "./execution.ts";
export type {
	ExecResult,
	FormatCommandEvidenceOptions,
	SdlConfirmPrompt,
	SdlExecOptions,
	SdlExtensionApi,
	SdlOutputStream,
	TemporaryFileOptions,
} from "./execution.ts";
export {
	normalizeTextOutput,
	stripOuterCodeFence,
	trimOuterBlankLines,
} from "@sdl/core/text-normalization";
export { truncateTextHead, truncateTextHeadTail } from "@sdl/core/text-truncation";
export type {
	HeadTailTextTruncationOptions,
	HeadTextTruncationOptions,
} from "@sdl/core/text-truncation";
export { failed, ok } from "./result.ts";
export type { SdlResult } from "./result.ts";
export { z } from "./schema.ts";
export type {
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerationUsage,
	TextGenerator,
} from "./text-generation.ts";
