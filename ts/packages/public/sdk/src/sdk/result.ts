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
	type ClinkrOkRenderOverrides,
	type ClinkrUsageErrorExit,
} from "@nseng-ai/clinkr";

export type CommandExit<T = unknown> = ClinkrExit<T>;
export type OkCommandExit<T> = Extract<ClinkrExit<T>, { type: "ok" }>;
export type NegativeCommandExit<T = never> = ClinkrNegativeExit<T>;
export type FailureCommandExit<T = never> = ClinkrFailureExit<T>;
export type UsageErrorCommandExit<T = never> = ClinkrUsageErrorExit<T>;
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
