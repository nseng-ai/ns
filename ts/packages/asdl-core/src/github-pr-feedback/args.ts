import {
	replyToReviewThreadMutation,
	resolveReviewThreadMutation,
	reviewThreadCommentsQuery,
	reviewThreadsQuery,
} from "./queries.ts";

export function reviewThreadPageArgs(
	prNumber: number,
	threadCursor: string | null | undefined,
): string[] {
	return [
		"api",
		"graphql",
		"-F",
		"owner={owner}",
		"-F",
		"repo={repo}",
		"-F",
		`number=${prNumber}`,
		...(threadCursor === null || threadCursor === undefined
			? []
			: ["-F", `threadCursor=${threadCursor}`]),
		"-f",
		`query=${reviewThreadsQuery}`,
	];
}

export function reviewThreadCommentPageArgs(threadId: string, commentCursor: string): string[] {
	return [
		"api",
		"graphql",
		"-f",
		`threadId=${threadId}`,
		"-F",
		`commentCursor=${commentCursor}`,
		"-f",
		`query=${reviewThreadCommentsQuery}`,
	];
}

export function replyToReviewThreadArgs(threadId: string, body: string): string[] {
	return [
		"api",
		"graphql",
		"-f",
		`threadId=${threadId}`,
		"-f",
		`body=${body}`,
		"-f",
		`query=${replyToReviewThreadMutation}`,
	];
}

export function resolveReviewThreadArgs(threadId: string): string[] {
	return [
		"api",
		"graphql",
		"-f",
		`threadId=${threadId}`,
		"-f",
		`query=${resolveReviewThreadMutation}`,
	];
}
