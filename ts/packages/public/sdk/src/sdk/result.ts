import {
	buildFailureMachineEnvelopeSchema,
	buildMachineEnvelopeSchema,
	buildSuccessMachineEnvelopeSchema,
	failure,
	machineEnvelopeSchema,
	negative,
	ok,
	toMachineEnvelope,
	usageError,
	type ClinkrExit,
	type ClinkrFailureExit,
	type ClinkrNegativeExit,
	type ClinkrOkExit,
	type ClinkrUsageErrorExit,
} from "@nseng-ai/clinkr";

export type CommandExit<
	TResult = unknown,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
> = ClinkrExit<TResult, TNegative, TFailure, TUsageError>;
export type OkCommandExit<T = unknown> = ClinkrOkExit<T>;
export type NegativeCommandExit<T = unknown> = ClinkrNegativeExit<T>;
export type FailureCommandExit<T = unknown> = ClinkrFailureExit<T>;
export type UsageErrorCommandExit<T = unknown> = ClinkrUsageErrorExit<T>;
export type { BuildFailureMachineEnvelopeSchemaOptions, MachineEnvelope } from "@nseng-ai/clinkr";

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
};
