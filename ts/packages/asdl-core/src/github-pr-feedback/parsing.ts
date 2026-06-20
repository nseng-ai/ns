import { z } from "zod";

import type { RunGitHubCliResult } from "../github-cli.ts";
import { githubGraphqlErrorsSchema, parseJsonUnknown } from "../github-graphql-json.ts";
import type { Result } from "../result.ts";

import { failureFromMessage, feedbackErr, feedbackOk, jsonErrorMessage } from "./failures.ts";
import type { GithubPrFeedbackFailure, GithubPrFeedbackOperation } from "./types.ts";

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
				prNumber: context.prNumber,
				threadId: context.threadId,
				cursorContext: context.cursorContext,
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
				prNumber: context.prNumber,
				threadId: context.threadId,
				cursorContext: context.cursorContext,
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
				message: jsonErrorMessage(parsed.error),
				run: context.run,
				stdout: text,
				prNumber: context.prNumber,
				threadId: context.threadId,
				cursorContext: context.cursorContext,
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
				prNumber: context.prNumber,
				threadId: context.threadId,
				cursorContext: context.cursorContext,
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
		readonly prNumber?: number | undefined;
		readonly threadId?: string | undefined;
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
			prNumber: context.prNumber,
			threadId: context.threadId,
			cursorContext: context.cursorContext,
		}),
	);
}

export interface GithubPrFeedbackFailureContext {
	readonly operation: GithubPrFeedbackOperation;
	readonly run: Extract<RunGitHubCliResult, { readonly type: "completed" }>;
	readonly prNumber?: number | undefined;
	readonly threadId?: string | undefined;
	readonly cursorContext?: string | undefined;
}
