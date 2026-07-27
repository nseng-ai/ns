export { createClinkrApp } from "./app.ts";
export type {
	ClinkrApp,
	ClinkrContextFreeApp,
	ClinkrContextFreeRunOptions,
	ClinkrContextfulApp,
	ClinkrRunOptions,
	CreateContextFreeClinkrAppOptions,
	CreateContextfulClinkrAppOptions,
} from "./app.ts";
export { cliOption, cliPositional, defineCommand } from "./command-definition.ts";
export type {
	ClinkrCommandDefinition,
	ClinkrCommandJsonSchemaDocument,
	ClinkrCommandMetadata,
	ClinkrCompletionCandidate,
	ClinkrCompletionRequest,
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
	CommandOutcome,
	FailureOutcome,
	NegativeOutcome,
	OutcomeStatus,
	SuccessOutcome,
	UsageErrorOutcome,
} from "./outcome.ts";
export { confirmOrUsageError } from "./confirmation.ts";
export type { ConfirmationOutcome } from "./confirmation.ts";
