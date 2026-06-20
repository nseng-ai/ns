import { z } from "zod";

import type { RunGitHubCliResult } from "../github-cli.ts";
import type { Result } from "../result.ts";

import { failureFromMessage, feedbackErr, feedbackOk, jsonErrorMessage } from "./failures.ts";
import { ghGraphqlErrorsSchema } from "./schemas.ts";
import type { GithubPrFeedbackFailure, GithubPrFeedbackOperation } from "./types.ts";

export function parseJson<T>(
	text: string,
	schema: z.ZodType<T>,
	context: GithubPrFeedbackFailureContext,
): Result<T, GithubPrFeedbackFailure> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		return feedbackErr(
			failureFromMessage({
				code: "github_pr_feedback_json_parse_failed",
				operation: context.operation,
				message: jsonErrorMessage(error),
				run: context.run,
				stdout: text,
				prNumber: context.prNumber,
				threadId: context.threadId,
				cursorContext: context.cursorContext,
			}),
		);
	}
	const result = schema.safeParse(parsed);
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

export function parseGraphqlJson<T>(
	text: string,
	schema: z.ZodType<T>,
	context: GithubPrFeedbackFailureContext,
): Result<T, GithubPrFeedbackFailure> {
	const base = parseJson(text, ghGraphqlErrorsSchema, context);
	if (!base.ok) return base;
	if (base.value.errors !== undefined && base.value.errors.length > 0) {
		return feedbackErr(
			failureFromMessage({
				code: "github_pr_feedback_graphql_failed",
				operation: context.operation,
				message: JSON.stringify(base.value.errors),
				run: context.run,
				stdout: text,
				graphqlErrors: base.value.errors,
				prNumber: context.prNumber,
				threadId: context.threadId,
				cursorContext: context.cursorContext,
			}),
		);
	}
	return parseJson(text, schema, context);
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
