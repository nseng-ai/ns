import { z } from "zod";

import type { RunGitHubCliResult } from "../cli.ts";
import { githubGraphqlErrorsSchema, parseJsonUnknown } from "../graphql-json.ts";
import { formatErrorMessage } from "@sdl/core/primitives";
import type { Result } from "@sdl/core/result";

import { failureContextFields, failureFromMessage, feedbackErr, feedbackOk } from "./failures.ts";
import type { GithubPrFeedbackFailure, GithubPrFeedbackOperation } from "./types.ts";

export type GithubJsonParseResult<T> =
	| { readonly type: "ok"; readonly value: T }
	| { readonly type: "parse-error"; readonly error: unknown }
	| { readonly type: "schema-error"; readonly error: z.ZodError };

export function parseGithubJson<T>(text: string, schema: z.ZodType<T>): GithubJsonParseResult<T> {
	const parsed = parseJsonUnknown(text);
	if (parsed.type === "error") return { type: "parse-error", error: parsed.error };
	const result = schema.safeParse(parsed.value);
	if (!result.success) return { type: "schema-error", error: result.error };
	return { type: "ok", value: result.data };
}

export function parseJson<T>(
	text: string,
	schema: z.ZodType<T>,
	context: GithubPrFeedbackFailureContext,
): Result<T, GithubPrFeedbackFailure> {
	const parsed = parseRawJsonText(text, context);
	if (!parsed.ok) return feedbackErr(parsed.error);
	return validateParsedJson({ value: parsed.value, text, schema, context });
}

export function parseGraphqlJson<T>(
	text: string,
	schema: z.ZodType<T>,
	context: GithubPrFeedbackFailureContext,
): Result<T, GithubPrFeedbackFailure> {
	const parsed = parseRawJsonText(text, context);
	if (!parsed.ok) return feedbackErr(parsed.error);
	const errorsResult = githubGraphqlErrorsSchema.safeParse(parsed.value);
	if (!errorsResult.success) {
		return feedbackErr(
			failureFromMessage({
				code: "github_pr_feedback_response_invalid",
				operation: context.operation,
				message: z.prettifyError(errorsResult.error),
				run: context.run,
				stdout: text,
				zodError: z.prettifyError(errorsResult.error),
				...failureContextFields(context),
			}),
		);
	}
	if (errorsResult.data.errors !== undefined && errorsResult.data.errors.length > 0) {
		return feedbackErr(
			failureFromMessage({
				code: "github_pr_feedback_graphql_failed",
				operation: context.operation,
				message: JSON.stringify(errorsResult.data.errors),
				run: context.run,
				stdout: text,
				graphqlErrors: errorsResult.data.errors,
				...failureContextFields(context),
			}),
		);
	}
	return validateParsedJson({ value: parsed.value, text, schema, context });
}

function parseRawJsonText(
	text: string,
	context: GithubPrFeedbackFailureContext,
): Result<unknown, GithubPrFeedbackFailure> {
	const parsed = parseJsonUnknown(text);
	if (parsed.type === "error") {
		return feedbackErr(
			failureFromMessage({
				code: "github_pr_feedback_json_parse_failed",
				operation: context.operation,
				message: formatErrorMessage(parsed.error),
				run: context.run,
				stdout: text,
				...failureContextFields(context),
			}),
		);
	}
	return feedbackOk(parsed.value);
}

interface ValidateParsedJsonOptions<T> {
	readonly value: unknown;
	readonly text: string;
	readonly schema: z.ZodType<T>;
	readonly context: GithubPrFeedbackFailureContext;
}

function validateParsedJson<T>(
	options: ValidateParsedJsonOptions<T>,
): Result<T, GithubPrFeedbackFailure> {
	const { value, text, schema, context } = options;
	const result = schema.safeParse(value);
	if (!result.success) {
		return feedbackErr(
			failureFromMessage({
				code: "github_pr_feedback_response_invalid",
				operation: context.operation,
				message: z.prettifyError(result.error),
				run: context.run,
				stdout: text,
				zodError: z.prettifyError(result.error),
				...failureContextFields(context),
			}),
		);
	}
	return feedbackOk(result.data);
}

export function requireCursor(
	endCursor: string | null | undefined,
	context: {
		readonly operation: GithubPrFeedbackOperation;
		readonly message: string;
		readonly prNumber?: number;
		readonly threadId?: string;
		readonly cursorContext: string;
	},
): Result<string, GithubPrFeedbackFailure> {
	if (endCursor !== null && endCursor !== undefined && endCursor !== "")
		return feedbackOk(endCursor);
	return feedbackErr(
		failureFromMessage({
			code: "github_pr_feedback_pagination_invalid",
			operation: context.operation,
			message: context.message,
			...failureContextFields(context),
		}),
	);
}

export interface GithubPrFeedbackFailureContext {
	readonly operation: GithubPrFeedbackOperation;
	readonly run: Extract<RunGitHubCliResult, { readonly type: "completed" }>;
	readonly prNumber?: number;
	readonly threadId?: string;
	readonly cursorContext?: string;
}
