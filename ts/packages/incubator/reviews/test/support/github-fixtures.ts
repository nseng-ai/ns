import type {
	GithubPrDiscussionComment,
	GithubPrRestReviewComment,
} from "@nseng-ai/extension-kit/github/pr-feedback";

export function githubRestReviewComment(input: {
	readonly author: string;
	readonly body: string;
	readonly id?: number;
}): GithubPrRestReviewComment {
	return {
		id: input.id ?? 1,
		reviewId: null,
		body: input.body,
		author: input.author,
		path: "",
		line: null,
		createdAt: "",
		updatedAt: null,
		inReplyToId: null,
	};
}

export function githubDiscussionComment(input: {
	readonly id: number;
	readonly author: string;
	readonly body: string;
}): GithubPrDiscussionComment {
	return { id: input.id, body: input.body, author: input.author, url: "" };
}
