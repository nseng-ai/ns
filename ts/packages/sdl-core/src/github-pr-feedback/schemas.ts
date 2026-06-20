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
	z.object({ login: z.string() }).loose(),
	z.null(),
]);

export const ghReviewSchema = z
	.object({
		id: z.string(),
		author: ghAuthorSchema,
		body: z.string(),
		state: z.string(),
		submittedAt: z.string(),
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

function withNumericGithubIdentity<
	T extends {
		readonly databaseId?: number | null | undefined;
		readonly id?: number | string | undefined;
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

function numericGithubIdentity(value: string | number | null | undefined): number | null {
	if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed === "") return null;
	const numeric = Number(trimmed);
	return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}
