import { z } from "zod";

export interface GithubPrIdentity {
	owner: string;
	repo: string;
	number: number;
}

export interface GithubRepositoryIdentity {
	owner: string;
	repo: string;
}

export interface GithubReviewThreadCounts {
	unresolved: number;
	total: number;
	hasMore: boolean;
}

export type GithubCheckBucket = "passing" | "pending" | "failing" | "unknown";

export interface GithubCheckTally {
	passing: number;
	pending: number;
	failing: number;
	unknown: number;
	hasMore?: boolean | undefined;
}

export interface GithubWorktreePrStatusArgs {
	owner: string;
	repo: string;
	headRefName: string;
}

export interface GithubWorktreePrStatus {
	number: number;
	url?: string | undefined;
	headRefName: string;
	headRefOid: string;
	threads: GithubReviewThreadCounts;
	checks: GithubCheckTally;
}

export const githubWorktreePrStatusQuery =
	"query($owner:String!,$repo:String!,$headRefName:String!){repository(owner:$owner,name:$repo){pullRequests(first:2,states:OPEN,headRefName:$headRefName,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number url headRefName headRefOid statusCheckRollup{contexts(first:100){pageInfo{hasNextPage} nodes{__typename ... on CheckRun{status conclusion} ... on StatusContext{state}}}} reviewThreads(first:100){totalCount pageInfo{hasNextPage} nodes{isResolved}}}}}}";

const githubGraphqlErrorsSchema = z.object({ errors: z.array(z.unknown()).optional() }).loose();

const githubReviewThreadConnectionSchema = z
	.object({
		totalCount: z.number().int().nonnegative().optional(),
		pageInfo: z
			.object({ hasNextPage: z.boolean().default(false) })
			.loose()
			.default({ hasNextPage: false }),
		nodes: z.array(z.object({ isResolved: z.boolean() }).loose()).default([]),
	})
	.loose();

const githubWorktreePrStatusResponseSchema = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequests: z.object({
					nodes: z
						.array(
							z
								.object({
									number: z.number().int().positive(),
									url: z.string().optional(),
									headRefName: z.string(),
									headRefOid: z.string(),
									statusCheckRollup: z
										.object({
											contexts: z
												.object({
													pageInfo: z
														.object({ hasNextPage: z.boolean().default(false) })
														.loose()
														.default({ hasNextPage: false }),
													nodes: z.array(z.unknown()).default([]),
												})
												.loose()
												.nullish(),
										})
										.loose()
										.nullish(),
									reviewThreads: githubReviewThreadConnectionSchema,
								})
								.loose(),
						)
						.default([]),
				}),
			}),
		}),
	})
	.loose();

const PASSING_CHECK_RUN_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const FAILING_CHECK_RUN_CONCLUSIONS = new Set([
	"ACTION_REQUIRED",
	"CANCELLED",
	"FAILURE",
	"STARTUP_FAILURE",
	"STALE",
	"TIMED_OUT",
]);
const PENDING_CHECK_RUN_STATUSES = new Set([
	"QUEUED",
	"IN_PROGRESS",
	"WAITING",
	"REQUESTED",
	"PENDING",
]);
const FAILING_STATUS_CONTEXT_STATES = new Set(["ERROR", "FAILURE"]);

export function githubWorktreePrStatusArgs(identity: GithubWorktreePrStatusArgs): string[] {
	return [
		"api",
		"graphql",
		"-f",
		`query=${githubWorktreePrStatusQuery}`,
		"-f",
		`owner=${identity.owner}`,
		"-f",
		`repo=${identity.repo}`,
		"-f",
		`headRefName=${identity.headRefName}`,
	];
}

export function githubPrIdentityFromUrl(
	url: string,
	expectedNumber?: number,
): GithubPrIdentity | undefined {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return undefined;
	}
	if (parsed.hostname !== "github.com") return undefined;
	const parts = parsed.pathname.split("/").filter((part) => part.length > 0);
	if (parts.length !== 4 || parts[2] !== "pull") return undefined;
	const number = Number(parts[3]);
	if (!Number.isInteger(number) || number <= 0) return undefined;
	if (expectedNumber !== undefined && number !== expectedNumber) return undefined;
	const [owner, repo] = parts;
	if (owner === undefined || repo === undefined || owner.length === 0 || repo.length === 0)
		return undefined;
	return { owner, repo, number };
}

export function normalizeGitRemoteUrl(rawUrl: string): string {
	const trimmed = rawUrl.trim();
	if (trimmed.length === 0) return "";

	const scpLike = parseScpLikeRemote(trimmed);
	const candidate = scpLike ?? trimmed;
	const normalizedUrl = normalizeAsUrl(candidate);
	if (normalizedUrl !== undefined) return normalizedUrl;

	return stripGitSuffix(stripTrailingSlashes(candidate));
}

export function githubRepositoryIdentityFromNormalizedRemoteUrl(
	normalizedUrl: string,
): GithubRepositoryIdentity | undefined {
	let parsed: URL;
	try {
		parsed = new URL(normalizedUrl);
	} catch {
		return undefined;
	}
	if (parsed.hostname !== "github.com") return undefined;
	const parts = parsed.pathname.split("/").filter((part) => part.length > 0);
	if (parts.length !== 2) return undefined;
	return repositoryIdentityFromParts(parts[0], parts[1]);
}

export function githubRepositoryIdentityFromRemoteUrl(
	url: string,
): GithubRepositoryIdentity | undefined {
	const normalized = normalizeGitRemoteUrl(url);
	return githubRepositoryIdentityFromNormalizedRemoteUrl(normalized);
}

export function parseGithubWorktreePrStatusJson(
	stdout: string,
): GithubWorktreePrStatus[] | undefined {
	const parsed = parseGraphqlJson(stdout);
	if (parsed === undefined) return undefined;

	const result = githubWorktreePrStatusResponseSchema.safeParse(parsed);
	if (!result.success) return undefined;
	return result.data.data.repository.pullRequests.nodes.map((node) => {
		const contexts = node.statusCheckRollup?.contexts;
		return {
			number: node.number,
			url: node.url,
			headRefName: node.headRefName,
			headRefOid: node.headRefOid,
			threads: reviewThreadCountsFromConnection(node.reviewThreads),
			checks: tallyGithubStatusChecks(contexts?.nodes ?? [], {
				hasMore: contexts?.pageInfo.hasNextPage ?? false,
			}),
		};
	});
}

export function classifyGithubStatusCheck(value: unknown): GithubCheckBucket {
	const parsed = z.object({ __typename: z.string() }).loose().safeParse(value);
	if (!parsed.success) return "unknown";
	if (parsed.data.__typename === "CheckRun") return classifyCheckRun(parsed.data);
	if (parsed.data.__typename === "StatusContext") return classifyStatusContext(parsed.data);
	return "unknown";
}

export function tallyGithubStatusChecks(
	items: readonly unknown[],
	options: { hasMore?: boolean | undefined } = {},
): GithubCheckTally {
	const tally: GithubCheckTally = { passing: 0, pending: 0, failing: 0, unknown: 0 };
	for (const item of items) {
		const bucket = classifyGithubStatusCheck(item);
		tally[bucket] += 1;
	}
	if (options.hasMore === true) tally.hasMore = true;
	return tally;
}

function repositoryIdentityFromParts(
	owner: string | undefined,
	repoWithSuffix: string | undefined,
): GithubRepositoryIdentity | undefined {
	if (
		owner === undefined ||
		repoWithSuffix === undefined ||
		owner.length === 0 ||
		repoWithSuffix.length === 0
	)
		return undefined;
	const repo = stripGitSuffix(repoWithSuffix);
	if (repo.length === 0 || repo.includes("/")) return undefined;
	return { owner, repo };
}

function normalizeAsUrl(value: string): string | undefined {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}

	const protocol = url.protocol.toLowerCase();
	const host = url.hostname.toLowerCase();
	const username = url.username ? `${url.username}@` : "";
	const port = url.port ? `:${url.port}` : "";
	const path = stripGitSuffix(stripTrailingSlashes(url.pathname.replace(/^\/+/, "")));
	if (path.length === 0) return `${protocol}//${username}${host}${port}`;
	return `${protocol}//${username}${host}${port}/${path}`;
}

function parseScpLikeRemote(value: string): string | undefined {
	if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return undefined;

	const match = /^(?<user>[^@/:]+@)?(?<host>[^:/]+):(?<path>.+)$/.exec(value);
	if (!match?.groups) return undefined;

	const user = match.groups.user ?? "";
	return `ssh://${user}${match.groups.host}/${match.groups.path}`;
}

function stripTrailingSlashes(value: string): string {
	return value.replace(/\/+$/g, "");
}

function stripGitSuffix(value: string): string {
	return value.replace(/\.git$/i, "");
}

function reviewThreadCountsFromConnection(
	connection: z.infer<typeof githubReviewThreadConnectionSchema>,
): GithubReviewThreadCounts {
	const hasMore = connection.pageInfo.hasNextPage;
	const totalCount = connection.totalCount ?? connection.nodes.length;
	return {
		unresolved: connection.nodes.filter((node) => !node.isResolved).length,
		total: hasMore ? connection.nodes.length : totalCount,
		hasMore,
	};
}

function parseGraphqlJson(text: string): unknown | undefined {
	const parsed = parseJson(text);
	if (parsed === undefined) return undefined;
	const errorsResult = githubGraphqlErrorsSchema.safeParse(parsed);
	if (!errorsResult.success) return undefined;
	if (errorsResult.data.errors !== undefined && errorsResult.data.errors.length > 0)
		return undefined;
	return parsed;
}

function classifyCheckRun(value: Record<string, unknown>): GithubCheckBucket {
	const status = typeof value.status === "string" ? value.status : undefined;
	if (status === undefined) return "unknown";
	if (status !== "COMPLETED") return PENDING_CHECK_RUN_STATUSES.has(status) ? "pending" : "unknown";

	const conclusion = typeof value.conclusion === "string" ? value.conclusion : undefined;
	if (conclusion === undefined) return "unknown";
	if (PASSING_CHECK_RUN_CONCLUSIONS.has(conclusion)) return "passing";
	if (FAILING_CHECK_RUN_CONCLUSIONS.has(conclusion)) return "failing";
	return "unknown";
}

function classifyStatusContext(value: Record<string, unknown>): GithubCheckBucket {
	const state = typeof value.state === "string" ? value.state : undefined;
	if (state === "SUCCESS") return "passing";
	if (state === "PENDING" || state === "EXPECTED") return "pending";
	if (state !== undefined && FAILING_STATUS_CONTEXT_STATES.has(state)) return "failing";
	return "unknown";
}

function parseJson(text: string): unknown | undefined {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}
