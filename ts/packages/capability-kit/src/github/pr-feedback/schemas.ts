import { z } from "zod";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

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
	resultType: z.enum(["exited", "spawn-failed", "cancelled", "timed-out"]).optional(),
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

const ghDiscussionCommentShape = {
	databaseId: z.number().int().positive().optional(),
	id: z.union([z.number().int().positive(), z.string()]).optional(),
	body: z.string(),
	user: ghAuthorSchema.optional(),
	url: z.string(),
	html_url: z.string().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
};

export const ghDiscussionCommentSchema = z
	.object({
		...ghDiscussionCommentShape,
		author: ghAuthorSchema,
	})
	.loose()
	.transform((comment, ctx) => withNumericGithubIdentity(comment, ctx, "Discussion comment"));

export const ghIssueCommentRestSchema = z
	.object({
		...ghDiscussionCommentShape,
		body: z.string().default(""),
		url: z.string().optional(),
		author: ghAuthorSchema.optional(),
	})
	.loose()
	.transform((comment, ctx) => withNumericGithubIdentity(comment, ctx, "Discussion comment"));

export const ghChangedFileSchema = z
	.object({
		filename: z.string().optional(),
		path: z.string().optional(),
		status: z.string().default("modified"),
		patch: z.string().nullable().optional(),
	})
	.loose();

export const ghReviewCommentSummaryRestSchema = z
	.object({
		body: z.string().default(""),
		author: ghAuthorSchema.optional(),
		user: ghAuthorSchema.optional(),
	})
	.loose();

export const ghReviewCommentRestSchema = z
	.object({
		id: z.union([z.number().int().positive(), z.string()]).optional(),
		databaseId: z.number().int().positive().optional(),
		pull_request_review_id: z
			.union([z.number().int().positive(), z.string()])
			.nullable()
			.optional(),
		body: z.string().default(""),
		author: ghAuthorSchema.optional(),
		user: ghAuthorSchema.optional(),
		path: z.string().default(""),
		line: z.number().int().nullable().optional(),
		created_at: z.string().optional(),
		updated_at: z.string().nullable().optional(),
		in_reply_to_id: z.union([z.number().int().positive(), z.string()]).nullable().optional(),
	})
	.loose()
	.transform((comment, ctx) => withNumericGithubIdentity(comment, ctx, "Review comment"));

export const ghRestReviewSchema = z
	.object({
		id: z.union([z.number().int().positive(), z.string()]).optional(),
		databaseId: z.number().int().positive().optional(),
		node_id: z.string().default(""),
		state: z.string().default(""),
		submitted_at: z.string().nullable().optional(),
		commit_id: z.string().nullable().optional(),
		author: ghAuthorSchema.optional(),
		user: ghAuthorSchema.optional(),
	})
	.loose()
	.transform((review, ctx) => withNumericGithubIdentity(review, ctx, "Review"));

export const ghChangedFilesResponseSchema = z.array(ghChangedFileSchema);
export const ghReviewCommentSummariesRestResponseSchema = z.array(ghReviewCommentSummaryRestSchema);
export const ghReviewCommentsRestResponseSchema = z.array(ghReviewCommentRestSchema);
export const ghIssueCommentsRestResponseSchema = z.array(ghIssueCommentRestSchema);
export const ghRestReviewsResponseSchema = z.array(ghRestReviewSchema);

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

const ghStatusCheckContextsSchema = z
	.object({ nodes: z.array(z.unknown()), pageInfo: ghPageInfoSchema })
	.loose();

const ghStatusCheckRollupSchema = z
	.object({ contexts: ghStatusCheckContextsSchema })
	.loose()
	.nullable();

const ghBranchPrCheckThreadConnectionSchema = z
	.object({
		nodes: z.array(z.object({ isResolved: z.boolean() }).loose()),
		pageInfo: ghPageInfoSchema,
	})
	.loose();

export const ghPrChecksResponseSchema = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequest: z.object({ statusCheckRollup: ghStatusCheckRollupSchema }),
			}),
		}),
	})
	.loose();

const ghBranchPrChecksNodeSchema = z
	.object({
		number: z.number().int().positive(),
		title: z.string(),
		url: z.string(),
		headRefName: z.string(),
		headRefOid: z.string().nullable().optional(),
		baseRefName: z.string(),
		isDraft: z.boolean(),
		commits: z
			.object({
				nodes: z.array(
					z
						.object({
							commit: z.object({ oid: z.string(), committedDate: z.string().nullable() }).loose(),
						})
						.loose(),
				),
			})
			.loose(),
		statusCheckRollup: ghStatusCheckRollupSchema,
		reviewThreads: ghBranchPrCheckThreadConnectionSchema,
	})
	.loose();

export type GhBranchPrChecksNode = z.output<typeof ghBranchPrChecksNodeSchema>;

const ghBranchPrChecksAliasSchema = z
	.object({ nodes: z.array(ghBranchPrChecksNodeSchema) })
	.loose()
	.nullable();

export const ghBranchPrChecksResponseSchema = z
	.object({
		data: z.object({ repository: z.record(z.string(), ghBranchPrChecksAliasSchema) }),
	})
	.loose();

export type GhBranchPrChecksResponse = z.infer<typeof ghBranchPrChecksResponseSchema>;

export const ghBranchPrCheckContextsResponseSchema = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequest: z
					.object({ headRefOid: z.string(), statusCheckRollup: ghStatusCheckRollupSchema })
					.nullable(),
			}),
		}),
	})
	.loose();

export const ghBranchPrCheckThreadsResponseSchema = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequest: z
					.object({ headRefOid: z.string(), reviewThreads: ghBranchPrCheckThreadConnectionSchema })
					.nullable(),
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
