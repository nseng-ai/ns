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
	type ClinkrFailureExit,
	type ClinkrNegativeExit,
	type ClinkrOkExit,
	type ClinkrOkRenderOverrides,
	type ClinkrUsageErrorExit,
} from "@nseng-ai/clinkr";

export type CommandExit<T = unknown> =
	| OkCommandExit<T>
	| NegativeCommandExit<T>
	| FailureCommandExit
	| UsageErrorCommandExit;
export type OkCommandExit<T> = ClinkrOkExit<T>;
export type NegativeCommandExit<T = never> = ClinkrNegativeExit<T>;
export type FailureCommandExit = ClinkrFailureExit;
export type UsageErrorCommandExit = ClinkrUsageErrorExit;
export type { BuildFailureMachineEnvelopeSchemaOptions, MachineEnvelope } from "@nseng-ai/clinkr";

export {
	buildFailureMachineEnvelopeSchema,
	buildMachineEnvelopeSchema,
	buildSuccessMachineEnvelopeSchema,
	machineEnvelopeSchema,
	toMachineEnvelope,
};

function commandOk<T>(data: T, overrides: ClinkrOkRenderOverrides = {}): CommandExit<T> {
	return ok(data, {
		...overrides,
		...(typeof data === "string" && overrides.human === undefined ? { human: data } : {}),
	});
}

export interface NegativeCommandExitOptions<T> {
	readonly data?: T;
	readonly human?: string;
}

function commandNegative<T = never>(
	message: string,
	options: NegativeCommandExitOptions<T> = {},
): CommandExit<T> {
	return negative(message, options);
}

export { failure, commandNegative as negative, commandOk as ok, usageError };
