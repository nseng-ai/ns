/**
 * GitHub GraphQL access for the `/stack:view` panel. This module builds ONE
 * batched query for every branch in the stack (one aliased `pullRequests`
 * selection per branch), runs it through the injected exec seam, and parses the
 * response defensively into per-branch PR data.
 *
 * Error model (kept consistent with `objectives.ts`): failures are returned as
 * typed discriminated-union values, never thrown. Per-branch parse problems
 * degrade to `null` (a branch with no open PR), while whole-response problems
 * (exec failure, invalid JSON, GraphQL errors, top-level schema mismatch) are
 * surfaced as their own result variants so the caller can decide how loud to be.
 *
 * The `contexts.nodes` selection mirrors `githubWorktreePrStatusQuery` in
 * `@nseng-ai/extension-kit/github/pr-status` so `classifyGithubStatusCheck` /
 * `normalizeGithubStatusChecks` see exactly the item shape they expect (including
 * `__typename`, the CheckRun conclusion/status/workflow-run fields used for
 * workflow-run dedupe, and the StatusContext state/context fields).
 */
import { z } from "zod";

import type {
	StackViewCheckEntry,
	StackViewPrChecks,
	StackViewPrThreads,
	StackViewThreadComment,
	StackViewThreadDetail,
} from "./types.ts";
import type { StackViewExecContext } from "./exec.ts";
import {
	GITHUB_CLI_TIMEOUT_MS,
	type GithubRepositoryIdentity,
} from "@nseng-ai/extension-kit/github";
import { normalizeGithubStatusChecks } from "@nseng-ai/extension-kit/github/pr-status";
import {
	graphqlErrorMessages,
	parseJsonUnknown,
} from "@nseng-ai/extension-kit/github/graphql-json";
import { commandFailureReason, commandSucceeded } from "@nseng-ai/foundation/exec";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

/** Per-branch PR data produced by the GraphQL layer; branch/parent/status/objectives are added downstream in `data.ts`. */
export interface StackPrData {
	number: number;
	title: string;
	url: string;
	isDraft: boolean;
	body: string;
	threads: StackViewPrThreads;
	checks: StackViewPrChecks;
	/** Named check entries backing the detail pane, aligned with {@link checks}' unknown→pending fold. */
	checkEntries: StackViewCheckEntry[];
	/** Unresolved-thread locations, limited to the first 100 fetched threads. */
	unresolvedThreads: StackViewThreadDetail[];
}

/** Result of parsing a batched stack-PR GraphQL response. */
export type StackPrParseResult =
	| { type: "ok"; prs: (StackPrData | null)[] }
	| { type: "graphql-errors"; messages: readonly string[] }
	| { type: "schema-mismatch" };

/** Result of running the batched stack-PR query end to end. */
export type FetchStackPrsResult =
	| { type: "ok"; prs: (StackPrData | null)[] }
	| { type: "exec-error"; message: string }
	| { type: "invalid-json"; message: string }
	| { type: "graphql-errors"; messages: readonly string[] }
	| { type: "schema-mismatch" };

export interface FetchStackPrsParams extends StackViewExecContext {
	branches: string[];
	repoIdentity: GithubRepositoryIdentity;
}

/**
 * The CheckRun/StatusContext field selection for `statusCheckRollup.contexts.nodes`.
 * Mirrors `githubWorktreePrStatusQuery` so the parsed items feed
 * `classifyGithubStatusCheck` / `normalizeGithubStatusChecks` unchanged.
 */
const STATUS_CHECK_FIELDS =
	"__typename ... on CheckRun{name status conclusion startedAt completedAt detailsUrl checkSuite{workflowRun{databaseId runNumber runAttempt createdAt updatedAt workflow{name}}}} ... on StatusContext{context state createdAt targetUrl}";

/**
 * Build ONE GraphQL document with an alias (`b0`, `b1`, …) per branch. Each
 * branch name is passed as its own `$branch{index}: String!` variable (supplied
 * by the caller via `-f`), alongside the `$owner`/`$repo` variables; the
 * per-branch `headRefName` references `$branch{index}`.
 */
export function buildStackPrQuery(branches: string[]): string {
	const branchVariables = branches.map((_branch, index) => `,$branch${index}:String!`).join("");
	const aliases = branches.map((_branch, index) => {
		return (
			`b${index}: pullRequests(headRefName: $branch${index}, states: [OPEN], first: 1)` +
			"{nodes{number title url isDraft body" +
			" reviewThreads(first:100){totalCount nodes{id isResolved path line originalLine" +
			" comments(first:30){totalCount nodes{id body author{login} createdAt}}" +
			" lastComment: comments(last:1){nodes{id}}}}" +
			" commits(last:1){nodes{commit{statusCheckRollup{state" +
			` contexts(first:100){totalCount nodes{${STATUS_CHECK_FIELDS}}}}}}}}}`
		);
	});
	return `query($owner:String!,$repo:String!${branchVariables}){repository(owner:$owner,name:$repo){${aliases.join(" ")}}}`;
}

const reviewThreadCommentsSchema = z
	.object({
		totalCount: z.number().int().nonnegative().default(0),
		nodes: z
			.array(
				z
					.object({
						id: z.string().nullish(),
						body: z.string().nullish(),
						author: z.object({ login: z.string() }).loose().nullish(),
						createdAt: z.string().nullish(),
					})
					.loose(),
			)
			.default([]),
	})
	.loose();

const reviewThreadLastCommentSchema = z
	.object({ nodes: z.array(z.object({ id: z.string().nullish() }).loose()).default([]) })
	.loose();

const reviewThreadsSchema = z
	.object({
		totalCount: z.number().int().nonnegative().default(0),
		nodes: z
			.array(
				z
					.object({
						id: z.string().nullish(),
						isResolved: z.boolean().default(false),
						path: z.string().nullish(),
						line: z.number().int().nullish(),
						originalLine: z.number().int().nullish(),
						comments: reviewThreadCommentsSchema.nullish(),
						lastComment: reviewThreadLastCommentSchema.nullish(),
					})
					.loose(),
			)
			.default([]),
	})
	.loose();

const contextsSchema = z
	.object({
		totalCount: z.number().int().nonnegative().default(0),
		nodes: z.array(z.unknown()).default([]),
	})
	.loose();

const commitsSchema = z
	.object({
		nodes: z
			.array(
				z
					.object({
						commit: z
							.object({
								statusCheckRollup: z
									.object({ contexts: contextsSchema.nullish() })
									.loose()
									.nullish(),
							})
							.loose(),
					})
					.loose(),
			)
			.default([]),
	})
	.loose();

const prNodeSchema = z
	.object({
		number: z.number().int().positive(),
		title: z.string().default(""),
		url: z.string().default(""),
		isDraft: z.boolean().default(false),
		body: z.string().default(""),
		reviewThreads: reviewThreadsSchema.nullish(),
		commits: commitsSchema.nullish(),
	})
	.loose();

const prConnectionSchema = z.object({ nodes: z.array(prNodeSchema).default([]) }).loose();

const stackPrResponseSchema = z
	.object({
		data: z.object({ repository: z.record(z.string(), z.unknown()).nullish() }).loose(),
	})
	.loose();

/**
 * Parse a batched stack-PR GraphQL response. Returns per-branch PR data aligned
 * with `branches` (positionally, via the `b{index}` aliases) or `null` for a
 * branch without an open PR. GraphQL errors and a missing/`null` `repository`
 * are surfaced as typed variants; any other malformed alias degrades to `null`.
 */
export function parseStackPrResponse(json: unknown, branches: string[]): StackPrParseResult {
	const errorMessages = graphqlErrorMessages(json);
	if (errorMessages !== undefined) return { type: "graphql-errors", messages: errorMessages };

	const root = stackPrResponseSchema.safeParse(json);
	if (!root.success) return { type: "schema-mismatch" };

	const repository = root.data.data.repository;
	if (repository === null || repository === undefined) return { type: "schema-mismatch" };

	const prs = branches.map((_branch, index) => stackPrDataFromAlias(repository[`b${index}`]));
	return { type: "ok", prs };
}

function stackPrDataFromAlias(aliasValue: unknown): StackPrData | null {
	const connection = prConnectionSchema.safeParse(aliasValue);
	if (!connection.success) return null;
	const node = connection.data.nodes[0];
	if (node === undefined) return null;
	const checks = checksFromNode(node.commits);
	return {
		number: node.number,
		title: node.title,
		url: node.url,
		isDraft: node.isDraft,
		body: node.body,
		threads: threadCountsFromNode(node.reviewThreads),
		checks: checks.counts,
		checkEntries: checks.entries,
		unresolvedThreads: unresolvedThreadDetailsFromNode(node.reviewThreads),
	};
}

function threadCountsFromNode(
	reviewThreads: z.infer<typeof reviewThreadsSchema> | null | undefined,
): StackViewPrThreads {
	if (reviewThreads === null || reviewThreads === undefined) return { resolved: 0, total: 0 };
	const resolved = reviewThreads.nodes.filter((thread) => thread.isResolved).length;
	// `resolved` counts only the fetched nodes (first 100). When `totalCount`
	// exceeds the fetched node count the resolved figure degrades gracefully
	// (it can only under-count), so `total` stays honest via the larger of the two.
	return { resolved, total: honestTotal(reviewThreads.totalCount, reviewThreads.nodes.length) };
}

/**
 * Extract the unresolved review threads' detail (id, location, author, fetched
 * comments, and last-comment change key) from the fetched nodes for the detail
 * pane and downstream enrichment. Only the first 100 threads are fetched, so
 * this list can be truncated; the authoritative unresolved *count* still comes
 * from {@link threadCountsFromNode} (via `totalCount`), so a paginated PR keeps
 * an honest total even when this list is short.
 */
function unresolvedThreadDetailsFromNode(
	reviewThreads: z.infer<typeof reviewThreadsSchema> | null | undefined,
): StackViewThreadDetail[] {
	if (reviewThreads === null || reviewThreads === undefined) return [];
	return reviewThreads.nodes
		.filter((thread) => !thread.isResolved)
		.map((thread) => {
			const comments = commentsFromThread(thread.comments);
			return {
				id: thread.id ?? null,
				path: thread.path ?? "",
				line: thread.line ?? thread.originalLine ?? null,
				author: comments[0]?.author ?? null,
				comments,
				lastCommentId: thread.lastComment?.nodes[0]?.id ?? null,
				totalComments: honestTotal(thread.comments?.totalCount ?? 0, comments.length),
			};
		});
}

/** The larger of the reported total and the fetched node count, so a paginated total never under-reports. */
function honestTotal(totalCount: number, fetchedLength: number): number {
	return Math.max(totalCount, fetchedLength);
}

/** Map the fetched comment nodes into the plain {@link StackViewThreadComment} shape (missing scalars → ""/null). */
function commentsFromThread(
	comments: z.infer<typeof reviewThreadCommentsSchema> | null | undefined,
): StackViewThreadComment[] {
	if (comments === null || comments === undefined) return [];
	return comments.nodes.map((comment) => ({
		id: comment.id ?? "",
		author: comment.author?.login ?? null,
		body: comment.body ?? "",
		createdAt: comment.createdAt ?? null,
	}));
}

/**
 * Roll up the CI checks for a PR into both the bucket counts and the named
 * entries backing the detail pane. Both derive from the same
 * `normalizeGithubStatusChecks` pass so the entries stay consistent with the
 * counts' `unknown`→`pending` fold.
 */
function checksFromNode(commits: z.infer<typeof commitsSchema> | null | undefined): {
	counts: StackViewPrChecks;
	entries: StackViewCheckEntry[];
} {
	const contexts = commits?.nodes[0]?.commit.statusCheckRollup?.contexts;
	const nodes = contexts?.nodes ?? [];
	const totalCount = contexts?.totalCount ?? nodes.length;
	const { counts: tally, checks } = normalizeGithubStatusChecks(nodes, {
		hasMore: totalCount > nodes.length,
	});
	// Fold `unknown` checks into `pending` so they never silently vanish and can
	// never mark a PR as failing; `total` stays the sum of the visible buckets.
	const pending = tally.pending + tally.unknown;
	const counts: StackViewPrChecks = {
		passing: tally.passing,
		failing: tally.failing,
		pending,
		cancelled: tally.cancelled,
		total: tally.passing + tally.failing + pending + tally.cancelled,
	};
	const entries: StackViewCheckEntry[] = checks.map((entry) => ({
		name: entry.name,
		workflowName: entry.workflowName,
		bucket: entry.bucket === "unknown" ? "pending" : entry.bucket,
		status: entry.status,
		conclusion: entry.conclusion,
		// StatusContexts carry their external URL in `targetUrl`; CheckRuns in
		// `detailsUrl`. Fold them so the entry's URL is populated for both kinds.
		detailsUrl: entry.detailsUrl ?? entry.targetUrl,
		identity: entry.identity,
	}));
	return { counts, entries };
}

/** Run the batched stack-PR query through the exec seam and parse the result. */
export async function fetchStackPrs(params: FetchStackPrsParams): Promise<FetchStackPrsResult> {
	const query = buildStackPrQuery(params.branches);
	// Each branch rides as its own `-f branch{index}=…` variable, positionally
	// aligned with the `$branch{index}` declarations `buildStackPrQuery` emits.
	const branchArgs = params.branches.flatMap((branch, index) => ["-f", `branch${index}=${branch}`]);
	const result = await params.execApi.exec(
		"gh",
		[
			"api",
			"graphql",
			"-f",
			`query=${query}`,
			"-f",
			`owner=${params.repoIdentity.owner}`,
			"-f",
			`repo=${params.repoIdentity.repo}`,
			...branchArgs,
		],
		{ cwd: params.cwd, timeout: GITHUB_CLI_TIMEOUT_MS },
	);
	if (!commandSucceeded(result))
		return { type: "exec-error", message: commandFailureReason(result) };

	const parsed = parseJsonUnknown(result.stdout);
	if (parsed.type === "error")
		return { type: "invalid-json", message: formatErrorMessage(parsed.error) };

	// `StackPrParseResult`'s variants are all assignable to `FetchStackPrsResult`.
	return parseStackPrResponse(parsed.value, params.branches);
}

/** Build the Graphite app URL for a PR. */
export function graphiteUrl(repoIdentity: GithubRepositoryIdentity, prNumber: number): string {
	return `https://app.graphite.com/github/pr/${repoIdentity.owner}/${repoIdentity.repo}/${prNumber}`;
}
