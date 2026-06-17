import { z } from "zod";

export interface GithubPrStatusView {
	number: number;
	url: string;
	statusCheckRollup: readonly unknown[];
}

export interface GithubPrIdentity {
	owner: string;
	repo: string;
	number: number;
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
}

export const githubReviewThreadCountsQuery =
	"query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100){totalCount pageInfo{hasNextPage} nodes{isResolved}}}}}";

const githubPrStatusViewSchema = z
	.object({
		number: z.number().int().positive(),
		url: z.string(),
		statusCheckRollup: z.array(z.unknown()).catch([]),
	})
	.loose();

const githubGraphqlErrorsSchema = z.object({ errors: z.array(z.unknown()).optional() }).loose();

const githubReviewThreadCountsResponseSchema = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequest: z.object({
					reviewThreads: z
						.object({
							totalCount: z.number().int().nonnegative().optional(),
							pageInfo: z.object({ hasNextPage: z.boolean().default(false) }).loose().default({ hasNextPage: false }),
							nodes: z.array(z.object({ isResolved: z.boolean() }).loose()).default([]),
						})
						.loose(),
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
const PENDING_CHECK_RUN_STATUSES = new Set(["QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED", "PENDING"]);
const FAILING_STATUS_CONTEXT_STATES = new Set(["ERROR", "FAILURE"]);

export function githubReviewThreadCountsArgs(identity: GithubPrIdentity): string[] {
	return [
		"api",
		"graphql",
		"-f",
		`query=${githubReviewThreadCountsQuery}`,
		"-f",
		`owner=${identity.owner}`,
		"-f",
		`repo=${identity.repo}`,
		"-F",
		`number=${identity.number}`,
	];
}

export function parseGithubPrStatusViewJson(stdout: string): GithubPrStatusView | undefined {
	const parsed = parseJson(stdout);
	if (parsed === undefined) return undefined;
	const result = githubPrStatusViewSchema.safeParse(parsed);
	if (!result.success) return undefined;
	return {
		number: result.data.number,
		url: result.data.url,
		statusCheckRollup: result.data.statusCheckRollup,
	};
}

export function githubPrIdentityFromUrl(url: string, expectedNumber?: number): GithubPrIdentity | undefined {
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
	if (owner === undefined || repo === undefined || owner.length === 0 || repo.length === 0) return undefined;
	return { owner, repo, number };
}

export function parseGithubReviewThreadCountsJson(stdout: string): GithubReviewThreadCounts | undefined {
	const parsed = parseJson(stdout);
	if (parsed === undefined) return undefined;
	const errorsResult = githubGraphqlErrorsSchema.safeParse(parsed);
	if (!errorsResult.success) return undefined;
	if (errorsResult.data.errors !== undefined && errorsResult.data.errors.length > 0) return undefined;

	const result = githubReviewThreadCountsResponseSchema.safeParse(parsed);
	if (!result.success) return undefined;
	const reviewThreads = result.data.data.repository.pullRequest.reviewThreads;
	const hasMore = reviewThreads.pageInfo.hasNextPage;
	const totalCount = reviewThreads.totalCount ?? reviewThreads.nodes.length;
	return {
		unresolved: reviewThreads.nodes.filter((node) => !node.isResolved).length,
		total: hasMore ? reviewThreads.nodes.length : totalCount,
		hasMore,
	};
}

export function classifyGithubStatusCheck(value: unknown): GithubCheckBucket {
	const parsed = z.object({ __typename: z.string() }).loose().safeParse(value);
	if (!parsed.success) return "unknown";
	if (parsed.data.__typename === "CheckRun") return classifyCheckRun(parsed.data);
	if (parsed.data.__typename === "StatusContext") return classifyStatusContext(parsed.data);
	return "unknown";
}

export function tallyGithubStatusChecks(items: readonly unknown[]): GithubCheckTally {
	const tally: GithubCheckTally = { passing: 0, pending: 0, failing: 0, unknown: 0 };
	for (const item of items) {
		const bucket = classifyGithubStatusCheck(item);
		tally[bucket] += 1;
	}
	return tally;
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
