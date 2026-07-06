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

/**
 * GraphQL `mergePullRequest` mechanics: argv builder, response schema, and parse helper for
 * squash-merging a pull request with an expected head OID and an explicit commit headline/body.
 * The consumer supplies the `gh` exec seam and runs the argv this module builds; the response's
 * `pullRequest` selection lets callers verify the merge without a follow-up `gh pr view`.
 */
export const MERGE_PULL_REQUEST_MUTATION_NAME = "mergePullRequest";

export const MERGE_PULL_REQUEST_MUTATION = `mutation($pullRequestId:ID!,$expectedHeadOid:GitObjectID!,$commitHeadline:String!,$commitBody:String!){${MERGE_PULL_REQUEST_MUTATION_NAME}(input:{pullRequestId:$pullRequestId,mergeMethod:SQUASH,expectedHeadOid:$expectedHeadOid,commitHeadline:$commitHeadline,commitBody:$commitBody}){pullRequest{number state mergedAt baseRefName headRefName url}}}`;

export interface MergePullRequestArgsInput {
	readonly pullRequestId: string;
	readonly expectedHeadOid: string;
	readonly commitHeadline: string;
	readonly commitBody: string;
}

export interface MergedPullRequest {
	readonly number: number;
	readonly state: string;
	readonly mergedAt: string | null;
	readonly baseRefName: string;
	readonly headRefName: string;
	readonly url?: string;
}

export type MergePullRequestParseResult =
	| { readonly type: "ok"; readonly pullRequest: MergedPullRequest }
	| { readonly type: "invalid-json" }
	| { readonly type: "graphql-errors"; readonly messages: readonly string[] }
	| { readonly type: "schema-mismatch" };

// String/ID scalars go through `-f` (raw string), matching the retarget mutation: `expectedHeadOid`
// is a `GitObjectID` (SHA string) that `-F` would try to coerce, and `commitHeadline`/`commitBody`
// carry arbitrary PR text that must not be JSON-parsed.
export function mergePullRequestArgs(input: MergePullRequestArgsInput): string[] {
	return [
		"api",
		"graphql",
		"-f",
		`pullRequestId=${input.pullRequestId}`,
		"-f",
		`expectedHeadOid=${input.expectedHeadOid}`,
		"-f",
		`commitHeadline=${input.commitHeadline}`,
		"-f",
		`commitBody=${input.commitBody}`,
		"-f",
		`query=${MERGE_PULL_REQUEST_MUTATION}`,
	];
}

const mergePullRequestResponseSchema = z
	.object({
		data: z
			.object({
				mergePullRequest: z
					.object({
						pullRequest: z
							.object({
								number: z.number().int().positive(),
								state: z.string(),
								mergedAt: z.string().nullable(),
								baseRefName: z.string(),
								headRefName: z.string(),
								url: z.string().optional(),
							})
							.loose(),
					})
					.loose(),
			})
			.loose(),
	})
	.loose();

export function parseMergePullRequestResult(stdout: string): MergePullRequestParseResult {
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

	const result = mergePullRequestResponseSchema.safeParse(parsed.value);
	if (!result.success) return { type: "schema-mismatch" };
	const pullRequest = result.data.data.mergePullRequest.pullRequest;
	return {
		type: "ok",
		pullRequest: {
			number: pullRequest.number,
			state: pullRequest.state,
			mergedAt: pullRequest.mergedAt,
			baseRefName: pullRequest.baseRefName,
			headRefName: pullRequest.headRefName,
			...(pullRequest.url === undefined ? {} : { url: pullRequest.url }),
		},
	};
}
