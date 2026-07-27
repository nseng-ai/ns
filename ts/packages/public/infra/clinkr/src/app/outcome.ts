import { z } from "zod";

/**
 * Design A command outcomes: typed success, untyped diagnostics.
 *
 * A command declares at most one typed payload (`resultSchema`, carried on
 * success outcomes). Error outcomes have fixed shapes and may carry optional
 * freeform JSON diagnostics under `data`. The outcome's own `status`
 * discriminant is the wire status.
 */

export interface SuccessOutcome<T> {
	readonly status: "success";
	/** Typed result payload; `undefined` when the command has no `resultSchema`. */
	readonly data: T;
	/** Human-format render override; never serialized. */
	readonly human?: string;
	/** Markdown-format render override; never serialized. */
	readonly markdown?: string;
}

export interface NegativeOutcome {
	readonly status: "negative";
	readonly message: string;
	/** Freeform JSON diagnostics; never validated. */
	readonly data?: unknown;
	/** Human-format render override; never serialized. */
	readonly human?: string;
}

export interface FailureOutcome {
	readonly status: "failure";
	readonly errorType: string;
	readonly message: string;
	/** Freeform JSON diagnostics; never validated. */
	readonly data?: unknown;
}

export interface UsageErrorOutcome {
	readonly status: "usage-error";
	/** Handler default "usage-error"; the framework uses "invalid-request" | "invalid-json-input". */
	readonly errorType: string;
	readonly message: string;
	/** Freeform JSON diagnostics; never validated. */
	readonly data?: unknown;
}

export type CommandOutcome<TResult = undefined> =
	| SuccessOutcome<TResult>
	| NegativeOutcome
	| FailureOutcome
	| UsageErrorOutcome;

export type OutcomeStatus = CommandOutcome<unknown>["status"];

export function ok(): SuccessOutcome<undefined>;
export function ok<T>(
	data: T,
	overrides?: { readonly human?: string; readonly markdown?: string },
): SuccessOutcome<T>;
export function ok<T>(
	data?: T,
	overrides: { readonly human?: string; readonly markdown?: string } = {},
): SuccessOutcome<T | undefined> {
	return { status: "success", data, ...overrides };
}

export function negative(
	message: string,
	options: { readonly data?: unknown; readonly human?: string } = {},
): NegativeOutcome {
	return { status: "negative", message, ...options };
}

export function failure(errorType: string, message: string, data?: unknown): FailureOutcome {
	return { status: "failure", errorType, message, ...(data === undefined ? {} : { data }) };
}

export function usageError(message: string, data?: unknown): UsageErrorOutcome {
	return {
		status: "usage-error",
		errorType: "usage-error",
		message,
		...(data === undefined ? {} : { data }),
	};
}

const EXIT_CODES = {
	success: 0,
	negative: 1,
	failure: 2,
	"usage-error": 2,
} as const satisfies Record<OutcomeStatus, 0 | 1 | 2>;

export function exitCodeFor(status: OutcomeStatus): 0 | 1 | 2 {
	return EXIT_CODES[status];
}

/**
 * The machine envelope is the outcome plus `exitCode`, minus render
 * overrides. The `data` key is omitted entirely when its value is
 * `undefined`. Field order is stable: `status`, `exitCode`, then the rest.
 */
export function toEnvelope(outcome: CommandOutcome<unknown>): Record<string, unknown> {
	const exitCode = exitCodeFor(outcome.status);
	switch (outcome.status) {
		case "success":
			return {
				status: outcome.status,
				exitCode,
				...(outcome.data === undefined ? {} : { data: outcome.data }),
			};
		case "negative":
			return {
				status: outcome.status,
				exitCode,
				message: outcome.message,
				...(outcome.data === undefined ? {} : { data: outcome.data }),
			};
		case "failure":
		case "usage-error":
			return {
				status: outcome.status,
				exitCode,
				errorType: outcome.errorType,
				message: outcome.message,
				...(outcome.data === undefined ? {} : { data: outcome.data }),
			};
	}
}

export function envelopeJsonText(value: unknown): string {
	return JSON.stringify(value, null, 2) ?? String(value);
}

/**
 * Single source of truth for the machine-envelope contract exposed through
 * `--json-schema`. Success `data` is typed by `resultSchema`; error-outcome
 * `data` is freeform.
 */
export function buildEnvelopeSchema(resultSchema: z.ZodType | undefined) {
	const success = z.strictObject({
		status: z.literal("success"),
		exitCode: z.literal(0),
		...(resultSchema === undefined ? {} : { data: resultSchema }),
	});
	const negativeEnvelope = z.strictObject({
		status: z.literal("negative"),
		exitCode: z.literal(1),
		message: z.string(),
		data: z.unknown().optional(),
	});
	const failureEnvelope = z.strictObject({
		status: z.literal("failure"),
		exitCode: z.literal(2),
		errorType: z.string(),
		message: z.string(),
		data: z.unknown().optional(),
	});
	const usageErrorEnvelope = z.strictObject({
		status: z.literal("usage-error"),
		exitCode: z.literal(2),
		errorType: z.string(),
		message: z.string(),
		data: z.unknown().optional(),
	});
	return z.union([success, negativeEnvelope, failureEnvelope, usageErrorEnvelope]);
}
