// Public author API for ns extensions.
// Keep ts/packages/kernel/docs/sdk-reference.md in sync when changing these exports.
export { defineExtension } from "./command.ts";
export {
	defineRepoLocalNsExtensionDescriptor,
	repoLocalNsCommandDescriptor,
} from "./repo-local-ns-extension.ts";
export {
	nsExtensionManifestCommandSchema,
	nsExtensionManifestSchema,
	nsExtensionPackageManifestSchema,
} from "./extension-manifest.ts";
export type {
	NsExtensionManifest,
	NsExtensionManifestCommand,
	NsExtensionPackageManifest,
} from "./extension-manifest.ts";
export type {
	ClinkrCompletionCandidate,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	ClinkrExit,
	ClinkrFormat,
	PositionalSpec,
	RenderCapabilities,
	NsCommand,
	NsCommandCompletionProvider,
	NsCommandRequest,
	NsCommandSchema,
	NsExtension,
} from "./command.ts";
export type {
	RepoLocalNsCommandDescriptorOptions,
	RepoLocalNsExtensionCommandDescriptor,
	RepoLocalNsExtensionDescriptor,
} from "./repo-local-ns-extension.ts";
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
export { failed, ok } from "./result.ts";
export type { NsResult } from "./result.ts";
export { noopNsCommandIo, noopNsProgress } from "./services.ts";
export type {
	NsCommandIo,
	NsCommandMessageOptions,
	NsNotifyLevel,
	NsProgress,
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
