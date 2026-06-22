// Public author API for SDL extensions.
// Keep ts/packages/sdl/docs/sdk-reference.md in sync when changing these exports.
export { defineExtension } from "./command.ts";
export type {
	PositionalSpec,
	SdlCommand,
	SdlCommandRequest,
	SdlCommandSchema,
	SdlExtension,
} from "./command.ts";
export { commandSucceeded, formatCommandEvidence } from "./execution.ts";
export type {
	ExecResult,
	FormatCommandEvidenceOptions,
	SdlConfirmPrompt,
	SdlExecOptions,
	SdlExtensionApi,
	SdlOutputStream,
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
export { checkpoint } from "./checkpoint.ts";
export type {
	PrepareCheckpointMessageOptions,
	SdkPreparedCheckpointMessage,
} from "./checkpoint.ts";
export { pendingWorktree } from "./pending-worktree.ts";
export type {
	SdkPendingWorktreeError,
	SdkPendingWorktreeLoadResult,
	SdkPendingWorktreeSnapshot,
	SdkWorktreeCommandResult,
} from "./pending-worktree.ts";
export { failed, ok } from "./result.ts";
export type { SdlResult } from "./result.ts";
export { z } from "./schema.ts";
export {
	CHANGES_MODEL_ENV,
	CHECKPOINT_MODEL_ENV,
	DEFAULT_CHANGES_MODEL_REF,
	DEFAULT_CHECKPOINT_MODEL_REF,
	DEFAULT_SUBMIT_FAILURE_MODEL_REF,
	LEGACY_CHANGES_MODEL_ENV,
	LEGACY_CHECKPOINT_MODEL_ENV,
	SUBMIT_FAILURE_MODEL_ENV,
	selectChangesModelRef,
	selectCheckpointModelRef,
	selectSubmitFailureModelRef,
	textGeneration,
} from "./text-generation.ts";
export type {
	TextGenerator,
	TextGenerationRequest,
	TextGenerationResult,
} from "./text-generation.ts";
