import {
	discussionCommentsQuery,
	replyToReviewThreadMutation,
	resolveReviewThreadMutation,
	reviewThreadCommentsQuery,
	reviewThreadsQuery,
} from "./queries.ts";

interface GraphqlField {
	readonly flag: "-f" | "-F";
	readonly name: string;
	readonly value: string | number;
}

function graphqlArgs(fields: readonly GraphqlField[], query: string): string[] {
	return [
		"api",
		"graphql",
		...fields.flatMap((field) => [field.flag, `${field.name}=${field.value}`]),
		"-f",
		`query=${query}`,
	];
}

function repoPrFields(prNumber: number): GraphqlField[] {
	return [
		{ flag: "-F", name: "owner", value: "{owner}" },
		{ flag: "-F", name: "repo", value: "{repo}" },
		{ flag: "-F", name: "number", value: prNumber },
	];
}

export function discussionCommentPageArgs(
	prNumber: number,
	commentCursor: string | null | undefined,
): string[] {
	return graphqlArgs(
		[
			...repoPrFields(prNumber),
			...(commentCursor === null || commentCursor === undefined
				? []
				: [{ flag: "-f" as const, name: "commentCursor", value: commentCursor }]),
		],
		discussionCommentsQuery,
	);
}

export function reviewThreadPageArgs(
	prNumber: number,
	threadCursor: string | null | undefined,
): string[] {
	return graphqlArgs(
		[
			...repoPrFields(prNumber),
			...(threadCursor === null || threadCursor === undefined
				? []
				: [{ flag: "-f" as const, name: "threadCursor", value: threadCursor }]),
		],
		reviewThreadsQuery,
	);
}

export function reviewThreadCommentPageArgs(threadId: string, commentCursor: string): string[] {
	return graphqlArgs(
		[
			{ flag: "-f", name: "threadId", value: threadId },
			{ flag: "-f", name: "commentCursor", value: commentCursor },
		],
		reviewThreadCommentsQuery,
	);
}

export function replyToReviewThreadArgs(threadId: string, body: string): string[] {
	return graphqlArgs(
		[
			{ flag: "-f", name: "threadId", value: threadId },
			{ flag: "-f", name: "body", value: body },
		],
		replyToReviewThreadMutation,
	);
}

export function resolveReviewThreadArgs(threadId: string): string[] {
	return graphqlArgs(
		[{ flag: "-f", name: "threadId", value: threadId }],
		resolveReviewThreadMutation,
	);
}
