// Public author API for SDL extensions.
// Keep ts/packages/kernel/docs/sdk-reference.md in sync when changing these exports.
export { defineExtension } from "./command.ts";
export {
	defineRepoLocalSdlExtensionDescriptor,
	repoLocalSdlCommandDescriptor,
} from "./repo-local-sdl-extension.ts";
export {
	sdlExtensionManifestCommandSchema,
	sdlExtensionManifestSchema,
	sdlExtensionPackageManifestSchema,
} from "./extension-manifest.ts";
export type {
	SdlExtensionManifest,
	SdlExtensionManifestCommand,
	SdlExtensionPackageManifest,
} from "./extension-manifest.ts";
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
export type {
	RepoLocalSdlCommandDescriptorOptions,
	RepoLocalSdlExtensionCommandDescriptor,
	RepoLocalSdlExtensionDescriptor,
} from "./repo-local-sdl-extension.ts";
export type {
	ExecResult,
	SdlConfirmOptions,
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
export { failed, ok } from "./result.ts";
export type { SdlResult } from "./result.ts";
export { noopSdlCommandIo, noopSdlProgress } from "./services.ts";
export type {
	SdlCommandIo,
	SdlCommandMessageOptions,
	SdlNotifyLevel,
	SdlProgress,
	SdlProgressPhaseEvent,
	SdlProgressPhaseListener,
} from "./services.ts";
export { z } from "./schema.ts";
export type {
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerationUsage,
	TextGenerator,
} from "./text-generation.ts";
