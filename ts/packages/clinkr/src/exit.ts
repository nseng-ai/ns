import { z } from "zod";

export interface ClinkrOkRenderOverrides {
	readonly human?: string;
	readonly markdown?: string;
}

export interface ClinkrOkExit<T> extends ClinkrOkRenderOverrides {
	readonly type: "ok";
	readonly data: T;
}

export interface ClinkrNegativeExit<T> {
	type: "negative";
	message: string;
	data?: T;
}

export interface ClinkrShellNegativeExit<T> {
	type: "shell-negative";
	message: string;
	data?: T;
}

export interface ClinkrFailureExit {
	type: "failure";
	errorType: string;
	message: string;
	data?: unknown;
}

export type ClinkrExit<T> =
	| ClinkrOkExit<T>
	| ClinkrNegativeExit<T>
	| ClinkrShellNegativeExit<T>
	| ClinkrFailureExit;

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
	status: "usage_error";
	exitCode: 2;
	errorType: string;
	message: string;
	data?: unknown;
}

export type MachineEnvelope =
	| OkMachineEnvelope
	| NegativeMachineEnvelope
	| FailureMachineEnvelope
	| UsageErrorMachineEnvelope;

export interface ClinkrExitCodeOptions {
	shellExitCode?: boolean | undefined;
}

const okMachineEnvelopeSchema = z.strictObject({
	status: z.literal("ok"),
	exitCode: z.literal(0),
	data: z.unknown(),
});
const negativeMachineEnvelopeSchema = z.strictObject({
	status: z.literal("negative"),
	exitCode: z.literal(1),
	message: z.string(),
	data: z.unknown().optional(),
});
const failureMachineEnvelopeSchema = z.strictObject({
	status: z.literal("failure"),
	exitCode: z.literal(2),
	errorType: z.string(),
	message: z.string(),
	data: z.unknown().optional(),
});
const usageErrorMachineEnvelopeSchema = z.strictObject({
	status: z.literal("usage_error"),
	exitCode: z.literal(2),
	errorType: z.string(),
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
	readonly statusSchema?: z.ZodType<"negative" | "failure" | "usage_error">;
	readonly exitCodeSchema?: z.ZodType<1 | 2>;
	readonly errorTypeSchema?: z.ZodType<string>;
	readonly messageSchema?: z.ZodType<string>;
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
			status: options.statusSchema ?? z.union([z.literal("negative"), z.literal("failure")]),
			exitCode: options.exitCodeSchema ?? z.union([z.literal(1), z.literal(2)]),
			errorType: options.errorTypeSchema ?? z.string(),
			message: options.messageSchema ?? z.string(),
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

export function ok<T>(data: T, overrides: ClinkrOkRenderOverrides = {}): ClinkrOkExit<T> {
	return {
		type: "ok",
		data,
		...(overrides.human === undefined ? {} : { human: overrides.human }),
		...(overrides.markdown === undefined ? {} : { markdown: overrides.markdown }),
	};
}

export function negative<T = never>(message: string, data?: T): ClinkrNegativeExit<T> {
	if (data === undefined) return { type: "negative", message };
	return { type: "negative", message, data };
}

export function shellNegative<T = never>(message: string, data?: T): ClinkrShellNegativeExit<T> {
	if (data === undefined) return { type: "shell-negative", message };
	return { type: "shell-negative", message, data };
}

export function failure(errorType: string, message: string, data?: unknown): ClinkrFailureExit {
	return { type: "failure", errorType, message, ...(data === undefined ? {} : { data }) };
}

export function exitCodeForExit(
	exit: ClinkrExit<unknown>,
	options: ClinkrExitCodeOptions = {},
): 0 | 1 | 2 {
	switch (exit.type) {
		case "ok":
			return 0;
		case "negative":
			return options.shellExitCode === true ? 1 : 0;
		case "shell-negative":
			return 1;
		case "failure":
			return 2;
	}
}

export function toMachineEnvelope(exit: ClinkrExit<unknown>): MachineEnvelope {
	switch (exit.type) {
		case "ok":
			return { status: "ok", exitCode: 0, data: exit.data };
		case "negative":
		case "shell-negative":
			return {
				status: "negative",
				exitCode: 1,
				message: exit.message,
				...(exit.data === undefined ? {} : { data: exit.data }),
			};
		case "failure":
			return {
				status: "failure",
				exitCode: 2,
				errorType: exit.errorType,
				message: exit.message,
				...(exit.data === undefined ? {} : { data: exit.data }),
			};
	}
}

export function usageErrorMachineEnvelope(
	message: string,
	data?: unknown,
): UsageErrorMachineEnvelope {
	return {
		status: "usage_error",
		exitCode: 2,
		errorType: "usage_error",
		message,
		...(data === undefined ? {} : { data }),
	};
}

export function envelopeJsonText(value: unknown): string {
	return JSON.stringify(value, null, 2) ?? String(value);
}
