import { resultOk, type Result } from "@nseng-ai/foundation/result";

import type {
	GithubPrDiscussionComment,
	GithubPrDiscussionCommentUpsert,
	GithubPrFeedbackFailure,
} from "./types.ts";

export interface FindPrDiscussionCommentByMarkerInput {
	readonly comments: readonly GithubPrDiscussionComment[];
	readonly marker: string;
	readonly authorLogin: string;
}

export function findPrDiscussionCommentByMarkerInComments(
	input: FindPrDiscussionCommentByMarkerInput,
): GithubPrDiscussionComment | null {
	return (
		input.comments.find(
			(comment) => comment.author === input.authorLogin && comment.body.includes(input.marker),
		) ?? null
	);
}

export interface UpsertPrDiscussionCommentByMarkerInput {
	readonly find: () => Promise<Result<GithubPrDiscussionComment | null, GithubPrFeedbackFailure>>;
	readonly add: () => Promise<Result<GithubPrDiscussionComment, GithubPrFeedbackFailure>>;
	readonly update: (
		comment: GithubPrDiscussionComment,
	) => Promise<Result<GithubPrDiscussionComment, GithubPrFeedbackFailure>>;
}

export async function upsertPrDiscussionCommentByMarkerWithCallbacks(
	input: UpsertPrDiscussionCommentByMarkerInput,
): Promise<Result<GithubPrDiscussionCommentUpsert, GithubPrFeedbackFailure>> {
	const existing = await input.find();
	if (!existing.ok) return existing;
	if (existing.value === null) {
		const created = await input.add();
		if (!created.ok) return created;
		return resultOk({ type: "created", comment: created.value });
	}
	const updated = await input.update(existing.value);
	if (!updated.ok) return updated;
	return resultOk({ type: "updated", comment: updated.value });
}
