import {
	branchPrChecksQuery,
	discussionCommentsQuery,
	prChecksQuery,
	replyToReviewThreadMutation,
	resolveReviewThreadMutation,
	resolveReviewThreadsMutation,
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

function repoFields(): GraphqlField[] {
	return [
		{ flag: "-F", name: "owner", value: "{owner}" },
		{ flag: "-F", name: "repo", value: "{repo}" },
	];
}

function repoPrFields(prNumber: number): GraphqlField[] {
	return [...repoFields(), { flag: "-F", name: "number", value: prNumber }];
}

export function prChangedFilesRestArgs(prNumber: number): string[] {
	return ["api", "--paginate", `repos/{owner}/{repo}/pulls/${prNumber}/files`];
}

export function prReviewCommentsRestArgs(prNumber: number): string[] {
	return ["api", "--paginate", `repos/{owner}/{repo}/pulls/${prNumber}/comments`];
}

export function prIssueCommentsRestArgs(prNumber: number, sinceIso?: string): string[] {
	return [
		"api",
		"--paginate",
		buildGitHubRestEndpoint(`repos/{owner}/{repo}/issues/${prNumber}/comments`, {
			per_page: sinceIso === undefined ? undefined : 100,
			since: sinceIso,
		}),
	];
}

export function prReviewCommentsFingerprintRestArgs(prNumber: number, sinceIso?: string): string[] {
	return [
		"api",
		"--method",
		"GET",
		buildGitHubRestEndpoint(`repos/{owner}/{repo}/pulls/${prNumber}/comments`, {
			per_page: 100,
			sort: "updated",
			direction: "desc",
			since: sinceIso,
		}),
		"--jq",
		"[.[] | {id, pull_request_review_id, created_at, updated_at, path, line, in_reply_to_id, author: .user.login}]",
	];
}

export function prReviewsFingerprintRestArgs(prNumber: number): string[] {
	return [
		"api",
		"--method",
		"GET",
		buildGitHubRestEndpoint(`repos/{owner}/{repo}/pulls/${prNumber}/reviews`, { per_page: 100 }),
		"--jq",
		"[.[] | {id, node_id, state, submitted_at, commit_id, author: .user.login}]",
	];
}

export function prIssueCommentsFingerprintRestArgs(prNumber: number, sinceIso?: string): string[] {
	return [
		"api",
		"--method",
		"GET",
		buildGitHubRestEndpoint(`repos/{owner}/{repo}/issues/${prNumber}/comments`, {
			per_page: 100,
			since: sinceIso,
		}),
		"--jq",
		"[.[] | {id, created_at, updated_at, author: .user.login}]",
	];
}

export function createPrReviewRestArgs(prNumber: number, inputPath: string): string[] {
	return [
		"api",
		"--method",
		"POST",
		`repos/{owner}/{repo}/pulls/${prNumber}/reviews`,
		"--input",
		inputPath,
	];
}

export function addPrDiscussionCommentRestArgs(prNumber: number, body: string): string[] {
	return [
		"api",
		"--method",
		"POST",
		`repos/{owner}/{repo}/issues/${prNumber}/comments`,
		"-f",
		`body=${body}`,
	];
}

export function updatePrDiscussionCommentRestArgs(commentId: number, body: string): string[] {
	return [
		"api",
		"--method",
		"PATCH",
		`repos/{owner}/{repo}/issues/comments/${commentId}`,
		"-f",
		`body=${body}`,
	];
}

function buildGitHubRestEndpoint(
	path: string,
	params: Record<string, string | number | undefined>,
): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) search.set(key, String(value));
	}
	return search.size === 0 ? path : `${path}?${search.toString()}`;
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

export function prChecksArgs(prNumber: number): string[] {
	return graphqlArgs(repoPrFields(prNumber), prChecksQuery);
}

export function branchPrChecksArgs(branches: readonly string[]): string[] {
	return graphqlArgs(
		[
			...repoFields(),
			...branches.map((branch, index) => ({
				flag: "-f" as const,
				name: `branch${index}`,
				value: branch,
			})),
		],
		branchPrChecksQuery(branches.length),
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

export function resolveReviewThreadsArgs(threadIds: readonly string[]): string[] {
	return graphqlArgs(
		threadIds.map((threadId, index) => ({
			flag: "-f" as const,
			name: `threadId${index}`,
			value: threadId,
		})),
		resolveReviewThreadsMutation(threadIds.length),
	);
}
