import { z } from "zod";

export interface ClinkrOkExit<T = unknown> {
	readonly type: "ok";
	readonly data?: T;
}

export interface ClinkrNegativeExit<T = unknown> {
	readonly type: "negative";
	readonly message: string;
	readonly data?: T;
}

export interface ClinkrFailureExit<T = unknown> {
	readonly type: "failure";
	readonly errorType: string;
	readonly message: string;
	readonly data?: T;
}

export interface ClinkrUsageErrorExit<T = unknown> {
	readonly type: "usageError";
	readonly errorType: "usageError";
	readonly message: string;
	readonly data?: T;
}

export type ClinkrExit<TResult, TNegative = TResult, TFailure = TResult, TUsageError = TResult> =
	| ClinkrOkExit<TResult>
	| ClinkrNegativeExit<TNegative>
	| ClinkrFailureExit<TFailure>
	| ClinkrUsageErrorExit<TUsageError>;

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

export interface ClinkrOutcomeSchemas {
	readonly resultSchema?: z.ZodType;
	readonly negativeSchema?: z.ZodType;
	readonly failureSchema?: z.ZodType;
	readonly usageErrorSchema?: z.ZodType;
}

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
	return envelopeBranch({ status: "ok", exitCode: 0 }, dataSchema);
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

export function buildMachineEnvelopeSchema(schemas: ClinkrOutcomeSchemas | z.ZodType): z.ZodUnion {
	const outcomeSchemas: ClinkrOutcomeSchemas =
		schemas instanceof z.ZodType ? { resultSchema: schemas } : schemas;
	return z.union([
		envelopeBranch({ status: "ok", exitCode: 0 }, outcomeSchemas.resultSchema),
		envelopeBranch(
			{ status: "negative", exitCode: 1, message: z.string() },
			outcomeSchemas.negativeSchema,
		),
		envelopeBranch(
			{ status: "failure", exitCode: 2, errorType: z.string(), message: z.string() },
			outcomeSchemas.failureSchema,
		),
		envelopeBranch(
			{
				status: "usageError",
				exitCode: 2,
				errorType: z.literal("usageError"),
				message: z.string(),
			},
			outcomeSchemas.usageErrorSchema,
		),
	]);
}

function envelopeBranch(
	fields: Record<string, z.ZodType | string | number>,
	dataSchema: z.ZodType | undefined,
): z.ZodObject {
	const shape: Record<string, z.ZodType> = {};
	for (const [key, value] of Object.entries(fields)) {
		shape[key] = typeof value === "string" || typeof value === "number" ? z.literal(value) : value;
	}
	if (dataSchema !== undefined) shape["data"] = dataSchema;
	return z.strictObject(shape);
}

export function ok(): ClinkrOkExit<never>;
export function ok<T>(data: T): ClinkrOkExit<T>;
export function ok<T>(...data: [] | [T]): ClinkrOkExit<T> {
	return data.length === 0 ? { type: "ok" } : { type: "ok", data: data[0] };
}

export function negative(message: string): ClinkrNegativeExit<never>;
export function negative<T>(message: string, data: T): ClinkrNegativeExit<T>;
export function negative<T>(message: string, ...data: [] | [T]): ClinkrNegativeExit<T> {
	return data.length === 0
		? { type: "negative", message }
		: { type: "negative", message, data: data[0] };
}

export function failure(errorType: string, message: string): ClinkrFailureExit<never>;
export function failure<T>(errorType: string, message: string, data: T): ClinkrFailureExit<T>;
export function failure<T>(
	errorType: string,
	message: string,
	...data: [] | [T]
): ClinkrFailureExit<T> {
	return data.length === 0
		? { type: "failure", errorType, message }
		: { type: "failure", errorType, message, data: data[0] };
}

export function usageError(message: string): ClinkrUsageErrorExit<never>;
export function usageError<T>(message: string, data: T): ClinkrUsageErrorExit<T>;
export function usageError<T>(message: string, ...data: [] | [T]): ClinkrUsageErrorExit<T> {
	return data.length === 0
		? { type: "usageError", errorType: "usageError", message }
		: { type: "usageError", errorType: "usageError", message, data: data[0] };
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

export function validateOutcomeData(
	exit: ClinkrExit<unknown>,
	schemas: ClinkrOutcomeSchemas,
): ClinkrExit<unknown> {
	const schema = schemaForExit(exit, schemas);
	if (schema === undefined) {
		if (Object.hasOwn(exit, "data")) {
			throw new Error(
				`clinkr: ${exit.type} outcome must be bodyless because its schema is omitted`,
			);
		}
		return exit;
	}
	if (!Object.hasOwn(exit, "data")) {
		throw new Error(`clinkr: ${exit.type} outcome requires data because its schema is configured`);
	}
	return { ...exit, data: schema.parse(exit.data) } as ClinkrExit<unknown>;
}

function schemaForExit(
	exit: ClinkrExit<unknown>,
	schemas: ClinkrOutcomeSchemas,
): z.ZodType | undefined {
	switch (exit.type) {
		case "ok":
			return schemas.resultSchema;
		case "negative":
			return schemas.negativeSchema;
		case "failure":
			return schemas.failureSchema;
		case "usageError":
			return schemas.usageErrorSchema;
	}
}

export function toMachineEnvelope(exit: ClinkrExit<unknown>): MachineEnvelope {
	const data = Object.hasOwn(exit, "data") ? { data: exit.data } : {};
	switch (exit.type) {
		case "ok":
			return { status: "ok", exitCode: 0, ...data };
		case "negative":
			return { status: "negative", exitCode: 1, message: exit.message, ...data };
		case "failure":
			return {
				status: "failure",
				exitCode: 2,
				errorType: exit.errorType,
				message: exit.message,
				...data,
			};
		case "usageError":
			return usageErrorMachineEnvelope(exit.message, exit.data, Object.hasOwn(exit, "data"));
	}
}

export function usageErrorMachineEnvelope(
	message: string,
	data?: unknown,
	hasData = data !== undefined,
): UsageErrorMachineEnvelope {
	return {
		status: "usageError",
		exitCode: 2,
		errorType: "usageError",
		message,
		...(hasData ? { data } : {}),
	};
}

export function envelopeJsonText(value: unknown): string {
	return JSON.stringify(value, null, 2) ?? String(value);
}
