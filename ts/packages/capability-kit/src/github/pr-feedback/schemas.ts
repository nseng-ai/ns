import { z } from "zod";
import type { ExplicitUndefined } from "@ns/core/primitives";

import { githubPrFeedbackFailureCodes, githubPrFeedbackOperations } from "./types.ts";

const githubPrFeedbackFailureOperationSchema = z.enum(githubPrFeedbackOperations);

const githubPrFeedbackFailureCodeSchema = z.enum(githubPrFeedbackFailureCodes);

const githubPrFeedbackFailureDetailsSchema = z.object({
	operation: githubPrFeedbackFailureOperationSchema,
	command: z.array(z.string()).readonly().optional(),
	displayCommand: z.string().optional(),
	stdout: z.string().optional(),
	stderr: z.string().optional(),
	exitCode: z.number().int().optional(),
	killed: z.boolean().optional(),
	graphqlErrors: z.unknown().optional(),
	zodError: z.string().optional(),
	prNumber: z.number().int().optional(),
	threadId: z.string().optional(),
	cursorContext: z.string().optional(),
});

export const githubPrFeedbackFailureSchema = z.object({
	code: githubPrFeedbackFailureCodeSchema,
	message: z.string(),
	details: githubPrFeedbackFailureDetailsSchema.optional(),
	displayCommand: z.string().optional(),
});

export const prSummarySchema = z.object({
	number: z.number().int(),
	title: z.string(),
	url: z.string(),
	headRefName: z.string(),
	baseRefName: z.string(),
	state: z.string(),
	headRefOid: z.string().nullable().optional(),
});

export const prSummaryListSchema = z.array(prSummarySchema);

export const ghAuthorSchema = z.union([
	z.string(),
	z.object({ login: z.string().optional() }).loose(),
	z.null(),
]);

export const ghReviewSchema = z
	.object({
		id: z.string(),
		author: ghAuthorSchema,
		body: z.string(),
		state: z.string(),
		submittedAt: z.string().nullable(),
	})
	.loose();

export const ghReviewsResponseSchema = z.object({ reviews: z.array(ghReviewSchema) }).loose();

export const ghReviewCommentSchema = z
	.object({
		databaseId: z.number().int().positive().nullable().optional(),
		id: z.union([z.number().int().positive(), z.string()]).optional(),
		body: z.string(),
		author: ghAuthorSchema,
		path: z.string(),
		line: z.number().int().nullable(),
		startLine: z.number().int().nullable().optional(),
		createdAt: z.string(),
		url: z.string(),
	})
	.loose()
	.transform((comment, ctx) => withNumericGithubIdentity(comment, ctx, "Review comment"));

export const ghPageInfoSchema = z
	.object({
		hasNextPage: z.boolean(),
		endCursor: z.string().nullable().optional(),
	})
	.loose();

export const ghReviewCommentConnectionSchema = z
	.object({
		nodes: z.array(ghReviewCommentSchema),
		pageInfo: ghPageInfoSchema,
	})
	.loose();

export const ghReviewThreadSchema = z
	.object({
		id: z.string().min(1),
		path: z.string(),
		line: z.number().int().nullable(),
		startLine: z.number().int().nullable().optional(),
		isResolved: z.boolean(),
		isOutdated: z.boolean(),
		comments: ghReviewCommentConnectionSchema,
	})
	.loose();

export type GhReviewThread = z.infer<typeof ghReviewThreadSchema>;

export const ghDiscussionCommentSchema = z
	.object({
		databaseId: z.number().int().positive().optional(),
		id: z.union([z.number().int().positive(), z.string()]).optional(),
		body: z.string(),
		author: ghAuthorSchema,
		user: ghAuthorSchema.optional(),
		url: z.string(),
		html_url: z.string().optional(),
	})
	.loose()
	.transform((comment, ctx) => withNumericGithubIdentity(comment, ctx, "Discussion comment"));

export const ghDiscussionCommentConnectionSchema = z
	.object({
		nodes: z.array(ghDiscussionCommentSchema),
		pageInfo: ghPageInfoSchema,
	})
	.loose();

export const ghDiscussionCommentsResponseSchema = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequest: z.object({ comments: ghDiscussionCommentConnectionSchema }).loose(),
			}),
		}),
	})
	.loose();

export const ghReviewThreadsResponseSchema = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequest: z.object({
					reviewThreads: z
						.object({
							nodes: z.array(ghReviewThreadSchema),
							pageInfo: ghPageInfoSchema,
						})
						.loose(),
				}),
			}),
		}),
	})
	.loose();

export const ghPrChecksResponseSchema = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequest: z.object({
					statusCheckRollup: z
						.object({
							contexts: z
								.object({
									nodes: z.array(z.unknown()),
									pageInfo: z.object({ hasNextPage: z.boolean() }).loose(),
								})
								.loose(),
						})
						.loose()
						.nullable(),
				}),
			}),
		}),
	})
	.loose();

export const ghReviewThreadCommentsResponseSchema = z
	.object({
		data: z.object({
			node: z.object({ comments: ghReviewCommentConnectionSchema }).loose().nullable(),
		}),
	})
	.loose();

export const ghReplyReviewThreadResponseSchema = z
	.object({
		data: z.object({
			addPullRequestReviewThreadReply: z
				.object({ comment: ghReviewCommentSchema.nullable() })
				.loose()
				.nullable(),
		}),
	})
	.loose();

export const ghResolveReviewThreadResponseSchema = z
	.object({
		data: z.object({
			resolveReviewThread: z
				.object({
					thread: z
						.object({ id: z.string().min(1), isResolved: z.boolean() })
						.loose()
						.nullable(),
				})
				.loose()
				.nullable(),
		}),
	})
	.loose();

const ghResolveReviewThreadAliasSchema = z
	.object({
		thread: z
			.object({ id: z.string().min(1), isResolved: z.boolean() })
			.loose()
			.nullable(),
	})
	.loose()
	.nullable();

export const ghResolveReviewThreadsResponseSchema = z
	.object({ data: z.record(z.string(), ghResolveReviewThreadAliasSchema) })
	.loose();

export type GhResolveReviewThreadsResponse = z.infer<typeof ghResolveReviewThreadsResponseSchema>;

export function withNumericGithubIdentity<
	T extends {
		readonly databaseId?: ExplicitUndefined<"external-mirror", number | null>;
		readonly id?: ExplicitUndefined<"external-mirror", number | string>;
	},
>(
	comment: T,
	ctx: z.RefinementCtx,
	label: string,
): (T & { readonly numericId: number }) | typeof z.NEVER {
	const numericId = numericGithubIdentity(comment.databaseId ?? comment.id);
	if (numericId === null) {
		ctx.addIssue({
			code: "custom",
			path: ["databaseId"],
			message: `${label} must include a positive integer databaseId or numeric id.`,
		});
		return z.NEVER;
	}
	return { ...comment, numericId };
}

export function numericGithubIdentity(value: string | number | null | undefined): number | null {
	if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed === "") return null;
	const numeric = Number(trimmed);
	return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}
