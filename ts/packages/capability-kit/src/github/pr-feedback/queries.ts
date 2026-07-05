export const discussionCommentsQuery = `
query($owner: String!, $repo: String!, $number: Int!, $commentCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      comments(first: 100, after: $commentCursor) {
        pageInfo { hasNextPage endCursor }
        nodes { databaseId body author { login } url }
      }
    }
  }
}`;

export const reviewThreadsQuery = `
query($owner: String!, $repo: String!, $number: Int!, $threadCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $threadCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          comments(first: 100) {
            pageInfo { hasNextPage endCursor }
            nodes { databaseId body author { login } path line: originalLine startLine: originalStartLine createdAt url }
          }
        }
      }
    }
  }
}`;

const PR_CHECKS_WORKFLOW_RUN_SELECTION = "workflow { name }";
const BRANCH_PR_CHECKS_WORKFLOW_RUN_SELECTION =
	"databaseId runNumber runAttempt createdAt updatedAt workflow { name }";

function statusCheckRollupSelection(options: {
	indent: string;
	workflowRunSelection: string;
}): string {
	const { indent, workflowRunSelection } = options;
	return `${indent}statusCheckRollup {
${indent}  contexts(first: 100) {
${indent}    pageInfo { hasNextPage }
${indent}    nodes {
${indent}      __typename
${indent}      ... on CheckRun { name status conclusion startedAt completedAt detailsUrl checkSuite { workflowRun { ${workflowRunSelection} } } }
${indent}      ... on StatusContext { context state createdAt targetUrl }
${indent}    }
${indent}  }
${indent}}`;
}

export const prChecksQuery = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
${statusCheckRollupSelection({ indent: "      ", workflowRunSelection: PR_CHECKS_WORKFLOW_RUN_SELECTION })}
    }
  }
}`;

export function branchPrChecksQuery(count: number): string {
	if (!Number.isSafeInteger(count) || count <= 0) {
		throw new Error(`Branch PR checks batch size must be positive; got ${count}`);
	}
	const variables = Array.from({ length: count }, (_, index) => `$branch${index}: String!`).join(
		", ",
	);
	const fields = Array.from(
		{ length: count },
		(_, index) =>
			`    b${index}: pullRequests(first: 2, states: OPEN, headRefName: $branch${index}, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        number title url headRefName headRefOid baseRefName
${statusCheckRollupSelection({ indent: "        ", workflowRunSelection: BRANCH_PR_CHECKS_WORKFLOW_RUN_SELECTION })}
      }
    }`,
	).join("\n");
	return `
query($owner: String!, $repo: String!, ${variables}) {
  repository(owner: $owner, name: $repo) {
${fields}
  }
}`;
}

export const reviewThreadCommentsQuery = `
query($threadId: ID!, $commentCursor: String) {
  node(id: $threadId) {
    ... on PullRequestReviewThread {
      comments(first: 100, after: $commentCursor) {
        pageInfo { hasNextPage endCursor }
        nodes { databaseId body author { login } path line: originalLine startLine: originalStartLine createdAt url }
      }
    }
  }
}`;

export const replyToReviewThreadMutation = `
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
    comment { databaseId id body author { login } path line: originalLine startLine: originalStartLine createdAt url }
  }
}`;

export const resolveReviewThreadMutation = `
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}`;

export function resolveReviewThreadsMutation(count: number): string {
	if (!Number.isSafeInteger(count) || count <= 0) {
		throw new Error(`Resolve review thread batch size must be positive; got ${count}`);
	}
	const variables = Array.from({ length: count }, (_, index) => `$threadId${index}: ID!`).join(
		", ",
	);
	const fields = Array.from(
		{ length: count },
		(_, index) => `  resolve${index}: resolveReviewThread(input: { threadId: $threadId${index} }) {
    thread { id isResolved }
  }`,
	).join("\n");
	return `
mutation(${variables}) {
${fields}
}`;
}
