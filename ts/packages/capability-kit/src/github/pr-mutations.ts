import { z } from "zod";

import {
	extractGraphqlErrorMessages,
	parseGraphqlErrors,
	parseJsonUnknown,
} from "./graphql-json.ts";

/**
 * GraphQL `updatePullRequest` mechanics: argv builder, response schema, and parse helper for
 * retargeting an open pull request's base branch. The consumer supplies the `gh` exec seam and runs
 * the argv this module builds (ADR 0019: real adapters stay in the consumer; the kit owns the
 * reusable GraphQL mechanics).
 */

export const RETARGET_PULL_REQUEST_BASE_MUTATION_NAME = "updatePullRequest";

export const RETARGET_PULL_REQUEST_BASE_MUTATION = `mutation($pullRequestId:ID!,$baseRefName:String!){${RETARGET_PULL_REQUEST_BASE_MUTATION_NAME}(input:{pullRequestId:$pullRequestId,baseRefName:$baseRefName}){pullRequest{id number baseRefName}}}`;

export interface RetargetPullRequestBaseArgsInput {
	readonly pullRequestId: string;
	readonly baseRefName: string;
}

export interface RetargetedPullRequest {
	readonly id: string;
	readonly number: number;
	readonly baseRefName: string;
}

export type RetargetPullRequestBaseParseResult =
	| { readonly type: "ok"; readonly pullRequest: RetargetedPullRequest }
	| { readonly type: "invalid-json" }
	| { readonly type: "graphql-errors"; readonly messages: readonly string[] }
	| { readonly type: "schema-mismatch" };

// String variables go through `-f` (raw string) rather than `-F`: `pullRequestId` and `baseRefName`
// are String/ID scalars, and `-F` would coerce numeric-looking branch names to typed values.
export function retargetPullRequestBaseArgs(input: RetargetPullRequestBaseArgsInput): string[] {
	return [
		"api",
		"graphql",
		"-f",
		`pullRequestId=${input.pullRequestId}`,
		"-f",
		`baseRefName=${input.baseRefName}`,
		"-f",
		`query=${RETARGET_PULL_REQUEST_BASE_MUTATION}`,
	];
}

const retargetPullRequestBaseResponseSchema = z
	.object({
		data: z
			.object({
				updatePullRequest: z
					.object({
						pullRequest: z
							.object({
								id: z.string(),
								number: z.number().int().positive(),
								baseRefName: z.string(),
							})
							.loose(),
					})
					.loose(),
			})
			.loose(),
	})
	.loose();

export function parseRetargetPullRequestBaseResult(
	stdout: string,
): RetargetPullRequestBaseParseResult {
	const parsed = parseJsonUnknown(stdout);
	if (parsed.type === "error") return { type: "invalid-json" };

	const graphqlErrors = parseGraphqlErrors(parsed.value);
	if (
		graphqlErrors.type === "ok" &&
		graphqlErrors.errors !== undefined &&
		graphqlErrors.errors.length > 0
	) {
		return { type: "graphql-errors", messages: extractGraphqlErrorMessages(graphqlErrors.errors) };
	}

	const result = retargetPullRequestBaseResponseSchema.safeParse(parsed.value);
	if (!result.success) return { type: "schema-mismatch" };
	const pullRequest = result.data.data.updatePullRequest.pullRequest;
	return {
		type: "ok",
		pullRequest: {
			id: pullRequest.id,
			number: pullRequest.number,
			baseRefName: pullRequest.baseRefName,
		},
	};
}
