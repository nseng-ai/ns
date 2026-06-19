import { z } from "zod";

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
	z.object({ login: z.string().default("") }).loose(),
	z.null(),
]);

export const ghReviewSchema = z
	.object({
		id: z.string(),
		author: ghAuthorSchema.default(""),
		body: z.string().default(""),
		state: z.string(),
		submittedAt: z.string().default(""),
	})
	.loose();

export const ghReviewsResponseSchema = z
	.object({ reviews: z.array(ghReviewSchema).default([]) })
	.loose();

export const ghReviewCommentSchema = z
	.object({
		databaseId: z.number().int().positive().nullable().optional(),
		id: z.union([z.number().int().positive(), z.string()]).optional(),
		body: z.string().default(""),
		author: ghAuthorSchema.default(""),
		path: z.string().default(""),
		line: z.number().int().nullable().default(null),
		startLine: z.number().int().nullable().optional(),
		createdAt: z.string().default(""),
		url: z.string().optional(),
	})
	.loose()
	.transform((comment, ctx) => {
		const numericId = numericGithubIdentity(comment.databaseId ?? comment.id);
		if (numericId === null) {
			ctx.addIssue({
				code: "custom",
				path: ["databaseId"],
				message: "Review comment must include a positive integer databaseId or numeric id.",
			});
			return z.NEVER;
		}
		return { ...comment, numericId };
	});

export const ghPageInfoSchema = z
	.object({
		hasNextPage: z.boolean().default(false),
		endCursor: z.string().nullable().optional(),
	})
	.loose();

export const ghReviewCommentConnectionSchema = z
	.object({
		nodes: z.array(ghReviewCommentSchema).default([]),
		pageInfo: ghPageInfoSchema.default({ hasNextPage: false }),
	})
	.loose();

export const ghReviewThreadSchema = z
	.object({
		id: z.string().min(1),
		path: z.string().default(""),
		line: z.number().int().nullable().default(null),
		startLine: z.number().int().nullable().optional(),
		isResolved: z.boolean().default(false),
		isOutdated: z.boolean().default(false),
		comments: ghReviewCommentConnectionSchema.default({
			nodes: [],
			pageInfo: { hasNextPage: false },
		}),
	})
	.loose();

export type GhReviewThread = z.infer<typeof ghReviewThreadSchema>;

export const ghDiscussionCommentSchema = z
	.object({
		databaseId: z.number().int().positive().optional(),
		id: z.union([z.number().int().positive(), z.string()]).optional(),
		body: z.string().default(""),
		author: ghAuthorSchema.default(""),
		user: ghAuthorSchema.optional(),
		url: z.string().default(""),
		html_url: z.string().optional(),
	})
	.loose()
	.transform((comment, ctx) => {
		const numericId = numericGithubIdentity(comment.databaseId ?? comment.id);
		if (numericId === null) {
			ctx.addIssue({
				code: "custom",
				path: ["databaseId"],
				message: "Discussion comment must include a positive integer databaseId or numeric id.",
			});
			return z.NEVER;
		}
		return { ...comment, numericId };
	});

export const ghDiscussionCommentConnectionSchema = z
	.object({
		nodes: z.array(ghDiscussionCommentSchema).default([]),
		pageInfo: ghPageInfoSchema.default({ hasNextPage: false }),
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

export const ghGraphqlErrorsSchema = z.object({ errors: z.array(z.unknown()).optional() }).loose();

export const ghReviewThreadsResponseSchema = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequest: z.object({
					reviewThreads: z
						.object({
							nodes: z.array(ghReviewThreadSchema).default([]),
							pageInfo: ghPageInfoSchema.default({ hasNextPage: false }),
						})
						.loose(),
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

function numericGithubIdentity(value: string | number | null | undefined): number | null {
	if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed === "") return null;
	const numeric = Number(trimmed);
	return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}
