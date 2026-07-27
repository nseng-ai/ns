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

interface ClinkrOkExitBase extends ClinkrOkRenderOverrides {
	readonly type: "ok";
}

interface ClinkrNegativeExitBase extends ClinkrNegativeRenderOverrides {
	readonly type: "negative";
	readonly message: string;
}

interface ClinkrFailureExitBase {
	readonly type: "failure";
	readonly errorType: string;
	readonly message: string;
}

interface ClinkrUsageErrorExitBase {
	readonly type: "usageError";
	readonly errorType: "usageError";
	readonly message: string;
}

type BodylessOutcome<TBase> = TBase & { readonly data?: never };
type WithOutcomeData<TBase, TData, TDataBearing> = [TData] extends [never]
	? BodylessOutcome<TBase>
	: TDataBearing;

// Data-bearing variants are generic interfaces (not structural intersections) so that
// TypeScript's inference from a contextual `ClinkrExit<T>` return type matches the ok
// variant by type reference and keeps call-site object literals narrowly typed.
interface ClinkrOkDataExit<T> extends ClinkrOkExitBase {
	readonly data: T;
}
interface ClinkrNegativeDataExit<T> extends ClinkrNegativeExitBase {
	readonly data: T;
}
interface ClinkrFailureDataExit<T> extends ClinkrFailureExitBase {
	readonly data: T;
}
interface ClinkrUsageErrorDataExit<T> extends ClinkrUsageErrorExitBase {
	readonly data: T;
}

type FlexibleOutcomeData<TBase, TDataBearing> = BodylessOutcome<TBase> | TDataBearing;

export type ClinkrOkExit<T = never> = WithOutcomeData<ClinkrOkExitBase, T, ClinkrOkDataExit<T>>;
export type ClinkrNegativeExit<T = never> = WithOutcomeData<
	ClinkrNegativeExitBase,
	T,
	ClinkrNegativeDataExit<T>
>;
export type ClinkrFailureExit<T = never> = WithOutcomeData<
	ClinkrFailureExitBase,
	T,
	ClinkrFailureDataExit<T>
>;
export type ClinkrUsageErrorExit<T = never> = WithOutcomeData<
	ClinkrUsageErrorExitBase,
	T,
	ClinkrUsageErrorDataExit<T>
>;

export type ClinkrExit<T = never> =
	| ClinkrOkDataExit<T>
	| BodylessOutcome<ClinkrNegativeExitBase>
	| ClinkrNegativeDataExit<T>
	| FlexibleOutcomeData<ClinkrFailureExitBase, ClinkrFailureDataExit<unknown>>
	| FlexibleOutcomeData<ClinkrUsageErrorExitBase, ClinkrUsageErrorDataExit<unknown>>;

type AnyClinkrExit = ClinkrExit<unknown> | ClinkrExit | ClinkrOkExit;

export interface OkMachineEnvelope {
	status: "ok";
	exitCode: 0;
	data?: unknown;
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
	data: z.unknown().optional(),
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
export function ok<T>(data: T, overrides?: ClinkrOkRenderOverrides): ClinkrOkDataExit<T>;
export function ok(
	data?: unknown,
	overrides: ClinkrOkRenderOverrides = {},
): ClinkrOkExit | ClinkrOkExit<unknown> {
	if (arguments.length === 0) return { type: "ok" };
	return {
		type: "ok",
		data,
		...(overrides.human === undefined ? {} : { human: overrides.human }),
		...(overrides.markdown === undefined ? {} : { markdown: overrides.markdown }),
	};
}

export function negative(message: string): ClinkrNegativeExit;
export function negative<const T>(
	message: string,
	options: ClinkrNegativeOptions<T> & { readonly data: T },
): ClinkrNegativeDataExit<T>;
export function negative(
	message: string,
	options: ClinkrNegativeRenderOverrides,
): ClinkrNegativeExit;
export function negative<T>(
	message: string,
	options: ClinkrNegativeOptions<T> = {},
): ClinkrNegativeExit | ClinkrNegativeExit<unknown> {
	const base = {
		type: "negative" as const,
		message,
		...(options.human === undefined ? {} : { human: options.human }),
	};
	if (!Object.hasOwn(options, "data")) return base;
	return { ...base, data: options.data as T };
}

export function failure(errorType: string, message: string): ClinkrFailureExit;
export function failure<const T>(
	errorType: string,
	message: string,
	data: T,
): ClinkrFailureDataExit<T>;
export function failure<T>(
	errorType: string,
	message: string,
	...dataArgument: [] | [data: T]
): ClinkrFailureExit | ClinkrFailureExit<unknown> {
	const base = { type: "failure" as const, errorType, message };
	if (dataArgument.length === 0) return base;
	return { ...base, data: dataArgument[0] };
}

export function usageError(message: string): ClinkrUsageErrorExit;
export function usageError<const T>(message: string, data: T): ClinkrUsageErrorDataExit<T>;
export function usageError<T>(
	message: string,
	...dataArgument: [] | [data: T]
): ClinkrUsageErrorExit | ClinkrUsageErrorExit<unknown> {
	const base = { type: "usageError" as const, errorType: "usageError" as const, message };
	if (dataArgument.length === 0) return base;
	return { ...base, data: dataArgument[0] };
}

const EXIT_CODE_BY_TYPE = {
	ok: 0,
	negative: 1,
	failure: 2,
	usageError: 2,
} as const satisfies Record<AnyClinkrExit["type"], 0 | 1 | 2>;

export function exitCodeForExit(exit: AnyClinkrExit): 0 | 1 | 2 {
	return EXIT_CODE_BY_TYPE[exit.type];
}

export function toMachineEnvelope(exit: AnyClinkrExit): MachineEnvelope {
	switch (exit.type) {
		case "ok":
			return {
				status: "ok",
				exitCode: EXIT_CODE_BY_TYPE.ok,
				...("data" in exit ? { data: exit.data } : {}),
			};
		case "negative":
			return {
				status: "negative",
				exitCode: EXIT_CODE_BY_TYPE.negative,
				message: exit.message,
				...("data" in exit ? { data: exit.data } : {}),
			};
		case "failure":
			return {
				status: "failure",
				exitCode: EXIT_CODE_BY_TYPE.failure,
				errorType: exit.errorType,
				message: exit.message,
				...("data" in exit ? { data: exit.data } : {}),
			};
		case "usageError":
			return {
				status: "usageError",
				exitCode: EXIT_CODE_BY_TYPE.usageError,
				errorType: "usageError",
				message: exit.message,
				...("data" in exit ? { data: exit.data } : {}),
			};
	}
}

export function usageErrorMachineEnvelope(message: string): UsageErrorMachineEnvelope;
export function usageErrorMachineEnvelope(
	message: string,
	data: unknown,
): UsageErrorMachineEnvelope;
export function usageErrorMachineEnvelope(
	message: string,
	...dataArgument: [] | [data: unknown]
): UsageErrorMachineEnvelope {
	return {
		status: "usageError",
		exitCode: EXIT_CODE_BY_TYPE.usageError,
		errorType: "usageError",
		message,
		...(dataArgument.length === 0 ? {} : { data: dataArgument[0] }),
	};
}

export function envelopeJsonText(value: unknown): string {
	return JSON.stringify(value, null, 2) ?? String(value);
}
