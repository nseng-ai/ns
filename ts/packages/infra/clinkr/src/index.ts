export {
	createClinkrInteraction,
	requireInteractiveOrUsageError,
	resolveClinkrInteraction,
} from "./confirmation.ts";
export type {
	ClinkrInteraction,
	ConfirmationDefault,
	ConfirmationRequest,
	ConfirmationResult,
	CreateClinkrInteractionOptions,
	ResolveClinkrInteractionOptions,
} from "./confirmation.ts";
export {
	DEFAULT_COLUMNS,
	readProcessCapsEnv,
	resolveCaps,
	resolveProcessCaps,
	resolveSettledNonInteractiveCaps,
} from "./caps.ts";
export type { Caps, CapsEnv, ColorDepth } from "./caps.ts";
export { CLINKR_CAPS_EXTENSION_KEY, readCapsFromHostExtension } from "./host-extension.ts";
export { completeClinkrWords } from "./completion.ts";
export type {
	ClinkrCompletionCandidate,
	ClinkrCompletionCandidateType,
	ClinkrCompletionCommandPlan,
	ClinkrCompletionGroupPlan,
	ClinkrCompletionOptionPlan,
	ClinkrCompletionRequest,
	ClinkrCompletionResult,
} from "./completion.ts";
export { ClinkrGroup } from "./group.ts";
export type {
	ClinkrCommandSpec,
	ClinkrGroupOptions,
	ClinkrHandler,
	ClinkrRunOptions,
	DefaultRawCommandSpec,
} from "./group.ts";
export {
	buildFailureMachineEnvelopeSchema,
	buildMachineEnvelopeSchema,
	buildSuccessMachineEnvelopeSchema,
	envelopeJsonText,
	exitCodeForExit,
	failure,
	failureMachineEnvelopeSchema,
	machineEnvelopeSchema,
	negative,
	negativeMachineEnvelopeSchema,
	ok,
	okMachineEnvelopeSchema,
	toMachineEnvelope,
	usageError,
	usageErrorMachineEnvelope,
	usageErrorMachineEnvelopeSchema,
} from "./exit.ts";
export type {
	BuildFailureMachineEnvelopeSchemaOptions,
	ClinkrExit,
	ClinkrFailureExit,
	ClinkrNegativeExit,
	ClinkrOkExit,
	ClinkrOkRenderOverrides,
	ClinkrUsageErrorExit,
	MachineEnvelope,
} from "./exit.ts";
export { ClinkrFailure } from "./failure.ts";
export {
	clinkrFormatFromArgs,
	clinkrFormatFromOption,
	isClinkrHumanOutputInvocation,
} from "./format.ts";
export { createProcessIo, resolveIo } from "./io.ts";
export type { ClinkrIo, ClinkrIoOverrides } from "./io.ts";
export { emitExit, resolveRenderCapabilities } from "./emit.ts";
export type { ClinkrFormat, EmitExitOptions, RenderCapabilities } from "./emit.ts";
export type { JsonSchemaDocument } from "./json-schema.ts";
export type { OptionSpec, PositionalSpec } from "./surface.ts";
