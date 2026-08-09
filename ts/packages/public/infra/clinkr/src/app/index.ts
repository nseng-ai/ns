export { createClinkrApp } from "./app.ts";
export { loadJsonInput, parseJsonInputText } from "./json-input.ts";
export type {
	JsonInputError,
	JsonInputResult,
	LoadJsonInputOptions,
	ParseJsonInputTextOptions,
	ReadJsonInputTextOptions,
} from "./json-input.ts";
export { resolveClinkrOutputFormat } from "./framework-arguments.ts";
export type { OutputFormat } from "./framework-arguments.ts";
export type {
	ClinkrApp,
	ClinkrContextFreeApp,
	ClinkrContextFreeCompleteOptions,
	ClinkrContextFreeRunOptions,
	ClinkrContextfulApp,
	ClinkrCompleteOptions,
	ClinkrCompletionFailure,
	ClinkrOutput,
	ContextFreeClinkrCompletionConfig,
	ContextfulClinkrCompletionConfig,
	ClinkrRunOptions,
	CreateComposedContextFreeClinkrAppOptions,
	CreateComposedContextfulClinkrAppOptions,
	CreateContextFreeClinkrAppOptions,
	CreateContextfulClinkrAppOptions,
} from "./app.ts";
export type {
	ClinkrComposition,
	ClinkrDefinitionLoader,
	ClinkrFilesystemMountOptions,
	ClinkrFilesystemSourceOptions,
	ClinkrScope,
	ClinkrSourceOptions,
} from "./programmatic-source.ts";
export { cliOption, cliPositional, defineCommand } from "./command-definition.ts";
export type {
	ClinkrCommandDefinition,
	ClinkrCommandJsonSchemaDocument,
	ClinkrCommandMetadata,
	ClinkrCompletionCandidate,
	ClinkrCompletionCandidateType,
	ClinkrCompletionProviderRequest,
	ClinkrCompletionRequest,
	ClinkrCompletionResult,
	ClinkrGroupDefinition,
	CliOptionOptions,
	CliPositionalOptions,
	ContextFreeCommandDefinition,
	ContextfulCommandDefinition,
	RenderCapabilities,
	ResultOf,
} from "./command-definition.ts";
// Internal envelope/schema policy (buildCommandJsonSchemaDocument,
// buildEnvelopeSchema, exitCodeFor, toEnvelope) is deliberately not exported:
// Clinkr alone builds envelopes and the --json-schema document; consumers
// observe them through app output.
export { failure, negative, ok, usageError } from "./outcome.ts";
export type {
	CommandExitCode,
	CommandOutcome,
	FailureOutcome,
	NegativeOutcome,
	OutcomeStatus,
	SuccessOutcome,
	UsageErrorOutcome,
} from "./outcome.ts";
export { confirmOrUsageError } from "./confirmation.ts";
export type {
	ConfirmationOutcome,
	ConfirmationPolicyOptions,
	ConfirmedOutcome,
} from "./confirmation.ts";
