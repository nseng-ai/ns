import { z } from "zod";

export interface ClinkrOkRenderOverrides {
	readonly human?: string;
	readonly markdown?: string;
}

export interface ClinkrNegativeRenderOverrides {
	readonly human?: string;
}

export interface ClinkrNegativeOptions<T> extends ClinkrNegativeRenderOverrides {
	readonly data?: T;
}

export interface ClinkrOkExit<T = undefined> extends ClinkrOkRenderOverrides {
	readonly type: "ok";
	readonly data: T;
}

export interface ClinkrNegativeExit<T> extends ClinkrNegativeRenderOverrides {
	type: "negative";
	message: string;
	data?: T;
}

export interface ClinkrFailureExit<T = unknown> {
	type: "failure";
	errorType: string;
	message: string;
	data?: T;
}

export interface ClinkrUsageErrorExit<T = unknown> {
	type: "usageError";
	errorType: "usageError";
	message: string;
	data?: T;
}

export type ClinkrExit<T> =
	| ClinkrOkExit<T>
	| ClinkrNegativeExit<T>
	| ClinkrFailureExit
	| ClinkrUsageErrorExit;

export interface OkMachineEnvelope {
	status: "ok";
	exitCode: 0;
	data: unknown;
}

export interface NegativeMachineEnvelope {
	status: "negative";
	exitCode: 1;
	message: string;
	data?: unknown;
}

export interface FailureMachineEnvelope {
	status: "failure";
	exitCode: 2;
	errorType: string;
	message: string;
	data?: unknown;
}

export interface UsageErrorMachineEnvelope {
	status: "usageError";
	exitCode: 2;
	errorType: "usageError";
	message: string;
	data?: unknown;
}

export type MachineEnvelope =
	| OkMachineEnvelope
	| NegativeMachineEnvelope
	| FailureMachineEnvelope
	| UsageErrorMachineEnvelope;

export const okMachineEnvelopeSchema = z.strictObject({
	status: z.literal("ok"),
	exitCode: z.literal(0),
	data: z.unknown(),
});
export const negativeMachineEnvelopeSchema = z.strictObject({
	status: z.literal("negative"),
	exitCode: z.literal(1),
	message: z.string(),
	data: z.unknown().optional(),
});
export const failureMachineEnvelopeSchema = z.strictObject({
	status: z.literal("failure"),
	exitCode: z.literal(2),
	errorType: z.string(),
	message: z.string(),
	data: z.unknown().optional(),
});
export const usageErrorMachineEnvelopeSchema = z.strictObject({
	status: z.literal("usageError"),
	exitCode: z.literal(2),
	errorType: z.literal("usageError"),
	message: z.string(),
	data: z.unknown().optional(),
});

export const machineEnvelopeSchema = z.discriminatedUnion("status", [
	okMachineEnvelopeSchema,
	negativeMachineEnvelopeSchema,
	failureMachineEnvelopeSchema,
	usageErrorMachineEnvelopeSchema,
]);

export interface BuildFailureMachineEnvelopeSchemaOptions {
	readonly errorTypeSchema?: z.ZodType<string>;
}

export function buildSuccessMachineEnvelopeSchema<DataSchema extends z.ZodType>(
	dataSchema: DataSchema,
) {
	return z
		.strictObject({
			status: z.literal("ok"),
			exitCode: z.literal(0),
			data: dataSchema,
		})
		.strict();
}

export function buildFailureMachineEnvelopeSchema(
	options: BuildFailureMachineEnvelopeSchemaOptions = {},
) {
	return z
		.strictObject({
			status: z.union([z.literal("negative"), z.literal("failure")]),
			exitCode: z.union([z.literal(1), z.literal(2)]),
			errorType: options.errorTypeSchema ?? z.string(),
			message: z.string(),
			data: z.unknown().optional(),
		})
		.strict();
}

export function buildMachineEnvelopeSchema<DataSchema extends z.ZodType>(dataSchema: DataSchema) {
	return z.discriminatedUnion("status", [
		buildSuccessMachineEnvelopeSchema(dataSchema),
		negativeMachineEnvelopeSchema,
		failureMachineEnvelopeSchema,
		usageErrorMachineEnvelopeSchema,
	]);
}

export function ok(): ClinkrOkExit;
export function ok<T>(data: T, overrides?: ClinkrOkRenderOverrides): ClinkrOkExit<T>;
export function ok<T>(
	data?: T,
	overrides: ClinkrOkRenderOverrides = {},
): ClinkrOkExit<T | undefined> {
	return {
		type: "ok",
		data,
		...(overrides.human === undefined ? {} : { human: overrides.human }),
		...(overrides.markdown === undefined ? {} : { markdown: overrides.markdown }),
	};
}

export function negative(message: string): ClinkrNegativeExit<never>;
export function negative<const T>(
	message: string,
	options: ClinkrNegativeOptions<T> & { readonly data: T },
): ClinkrNegativeExit<T> & { readonly data: T };
export function negative<T>(
	message: string,
	options: ClinkrNegativeOptions<T>,
): ClinkrNegativeExit<T>;
export function negative<T = never>(
	message: string,
	options: ClinkrNegativeOptions<T> = {},
): ClinkrNegativeExit<T> {
	return {
		type: "negative",
		message,
		...(options.data === undefined ? {} : { data: options.data }),
		...(options.human === undefined ? {} : { human: options.human }),
	};
}

export function failure(errorType: string, message: string): ClinkrFailureExit<never>;
export function failure<const T>(
	errorType: string,
	message: string,
	data: T,
): ClinkrFailureExit<T> & { readonly data: T };
export function failure<T>(
	errorType: string,
	message: string,
	data?: T,
): ClinkrFailureExit<T | never> {
	return { type: "failure", errorType, message, ...(data === undefined ? {} : { data }) };
}

export function usageError(message: string): ClinkrUsageErrorExit<never>;
export function usageError<const T>(
	message: string,
	data: T,
): ClinkrUsageErrorExit<T> & { readonly data: T };
export function usageError<T>(message: string, data?: T): ClinkrUsageErrorExit<T | never> {
	return {
		type: "usageError",
		errorType: "usageError",
		message,
		...(data === undefined ? {} : { data }),
	};
}

const EXIT_CODE_BY_TYPE = {
	ok: 0,
	negative: 1,
	failure: 2,
	usageError: 2,
} as const satisfies Record<ClinkrExit<unknown>["type"], 0 | 1 | 2>;

export function exitCodeForExit(exit: ClinkrExit<unknown>): 0 | 1 | 2 {
	return EXIT_CODE_BY_TYPE[exit.type];
}

export function toMachineEnvelope(exit: ClinkrExit<unknown>): MachineEnvelope {
	switch (exit.type) {
		case "ok":
			return { status: "ok", exitCode: EXIT_CODE_BY_TYPE.ok, data: exit.data };
		case "negative":
			return {
				status: "negative",
				exitCode: EXIT_CODE_BY_TYPE.negative,
				message: exit.message,
				...(exit.data === undefined ? {} : { data: exit.data }),
			};
		case "failure":
			return {
				status: "failure",
				exitCode: EXIT_CODE_BY_TYPE.failure,
				errorType: exit.errorType,
				message: exit.message,
				...(exit.data === undefined ? {} : { data: exit.data }),
			};
		case "usageError":
			return usageErrorMachineEnvelope(exit.message, exit.data);
	}
}

export function usageErrorMachineEnvelope(
	message: string,
	data?: unknown,
): UsageErrorMachineEnvelope {
	return {
		status: "usageError",
		exitCode: EXIT_CODE_BY_TYPE.usageError,
		errorType: "usageError",
		message,
		...(data === undefined ? {} : { data }),
	};
}

export function envelopeJsonText(value: unknown): string {
	return JSON.stringify(value, null, 2) ?? String(value);
}
