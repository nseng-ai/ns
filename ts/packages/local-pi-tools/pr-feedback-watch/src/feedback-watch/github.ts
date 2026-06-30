import { githubPrIdentityFromUrl } from "@sdl/github/identity";

import { isRecord, stringField } from "@sdl/pi/runtime/primitives";
import { loadGhCommand } from "@sdl/pi/shared/gh-command";

import { GIT_TIMEOUT_MS, REST_FINGERPRINT_SKEW_MS } from "./constants.ts";
import {
	buildFeedbackFingerprint,
	parseDiscussionCommentFingerprint,
	parseReviewCommentFingerprint,
	parseReviewFingerprint,
} from "./fingerprint.ts";
import type {
	FeedbackFingerprint,
	PrCheckSummary,
	PrFeedbackWatchGithubPrIdentity,
} from "./model.ts";
import type { ExecGateway } from "./types.ts";

interface LoadRestFingerprintOptions {
	pi: ExecGateway;
	cwd: string;
	identity: PrFeedbackWatchGithubPrIdentity;
	sinceIso?: string;
	signal?: AbortSignal;
}

interface LoadPrCheckSummaryOptions {
	pi: ExecGateway;
	cwd: string;
	prNumber: number;
	signal?: AbortSignal;
}

interface GhApiJsonOptions {
	pi: ExecGateway;
	cwd: string;
	endpoint: string;
	jq: string;
	signal?: AbortSignal;
}

interface GhJsonCommandOptions {
	pi: ExecGateway;
	cwd: string;
	args: string[];
	label: string;
	signal?: AbortSignal;
	shouldAllowNonZeroWithStdout?: boolean;
}

type GhJsonCommandResult = { type: "loaded"; value: unknown } | { type: "failed"; message: string };
type GhApiJsonResult = GhJsonCommandResult;

export function parseGitHubPullRequestUrl(
	url: string | undefined,
	fallbackNumber: number | undefined,
): PrFeedbackWatchGithubPrIdentity | undefined {
	if (url === undefined) return undefined;
	const identity = githubPrIdentityFromUrl(url, fallbackNumber);
	return identity === undefined ? undefined : { ...identity, url };
}
export async function loadCurrentGitHubLogin(
	pi: ExecGateway,
	cwd: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	const result = await loadGhCommand({
		pi,
		args: ["api", "user", "--jq", ".login"],
		cwd,
		timeoutMs: GIT_TIMEOUT_MS,
		signal,
	});
	return result.type === "loaded" ? result.stdout.trim() || undefined : undefined;
}

export async function loadHeadRefOid(
	pi: ExecGateway,
	cwd: string,
	prNumber: number,
	signal?: AbortSignal,
): Promise<string | undefined> {
	const result = await loadGhCommand({
		pi,
		args: ["pr", "view", String(prNumber), "--json", "headRefOid", "--jq", ".headRefOid"],
		cwd,
		timeoutMs: GIT_TIMEOUT_MS,
		signal,
	});
	return result.type === "loaded" ? result.stdout.trim() || undefined : undefined;
}

export async function loadPrCheckSummary(
	options: LoadPrCheckSummaryOptions,
): Promise<{ type: "loaded"; summary: PrCheckSummary } | { type: "failed"; message: string }> {
	const { pi, cwd, prNumber, signal } = options;
	const result = await ghJsonCommand({
		pi,
		cwd,
		args: ["pr", "checks", String(prNumber), "--json", "bucket"],
		label: "gh pr checks",
		...(signal === undefined ? {} : { signal }),
		shouldAllowNonZeroWithStdout: true,
	});
	return result.type === "loaded"
		? { type: "loaded", summary: parsePrCheckSummary(result.value) }
		: result;
}

function parsePrCheckSummary(value: unknown): PrCheckSummary {
	const items = Array.isArray(value) ? value : [];
	let pendingCount = 0;
	let passCount = 0;
	let failCount = 0;
	for (const item of items) {
		if (!isRecord(item)) continue;
		const bucket = stringField(item, "bucket");
		if (bucket === "pending") pendingCount += 1;
		if (bucket === "pass") passCount += 1;
		if (bucket === "fail") failCount += 1;
	}
	return { totalCount: items.length, pendingCount, passCount, failCount };
}

export async function loadRestFingerprint(
	options: LoadRestFingerprintOptions,
): Promise<
	{ type: "loaded"; fingerprint: FeedbackFingerprint } | { type: "failed"; message: string }
> {
	const { pi, cwd, identity, sinceIso, signal } = options;
	const discussionEndpoint = discussionCommentsEndpoint(identity, sinceIso);
	const reviewsEndpointValue = reviewsEndpoint(identity);
	const reviewCommentsEndpointValue = reviewCommentsEndpoint(identity, sinceIso);
	const [discussionResult, reviewsResult, reviewCommentsResult] = await Promise.allSettled([
		ghApiJson({
			pi,
			cwd,
			endpoint: discussionEndpoint,
			jq: "[.[] | {id, created_at, updated_at, author: .user.login}]",
			...(signal === undefined ? {} : { signal }),
		}),
		ghApiJson({
			pi,
			cwd,
			endpoint: reviewsEndpointValue,
			jq: "[.[] | {id, node_id, state, submitted_at, commit_id, author: .user.login}]",
			...(signal === undefined ? {} : { signal }),
		}),
		ghApiJson({
			pi,
			cwd,
			endpoint: reviewCommentsEndpointValue,
			jq: "[.[] | {id, pull_request_review_id, created_at, updated_at, path, line, in_reply_to_id, author: .user.login}]",
			...(signal === undefined ? {} : { signal }),
		}),
	]);
	const discussion = settledGhApiJsonResult(discussionResult, discussionEndpoint);
	const reviews = settledGhApiJsonResult(reviewsResult, reviewsEndpointValue);
	const reviewComments = settledGhApiJsonResult(reviewCommentsResult, reviewCommentsEndpointValue);
	if (discussion.type === "failed") return discussion;
	if (reviews.type === "failed") return reviews;
	if (reviewComments.type === "failed") return reviewComments;
	return {
		type: "loaded",
		fingerprint: buildFeedbackFingerprint([
			...parseDiscussionCommentFingerprint(discussion.value),
			...parseReviewFingerprint(reviews.value),
			...parseReviewCommentFingerprint(reviewComments.value),
		]),
	};
}

function settledGhApiJsonResult(
	result: PromiseSettledResult<GhApiJsonResult>,
	endpoint: string,
): GhApiJsonResult {
	if (result.status === "fulfilled") return result.value;
	return {
		type: "failed",
		message: `gh api failed for ${endpoint}: ${formatUnknownError(result.reason)}`,
	};
}

async function ghApiJson(options: GhApiJsonOptions): Promise<GhApiJsonResult> {
	const { pi, cwd, endpoint, jq, signal } = options;
	return ghJsonCommand({
		pi,
		cwd,
		args: ["api", "--method", "GET", endpoint, "--jq", jq],
		label: `gh api for ${endpoint}`,
		...(signal === undefined ? {} : { signal }),
	});
}

async function ghJsonCommand(options: GhJsonCommandOptions): Promise<GhJsonCommandResult> {
	const { pi, cwd, args, label, signal, shouldAllowNonZeroWithStdout = false } = options;
	const result = await loadGhCommand({
		pi,
		args,
		cwd,
		timeoutMs: GIT_TIMEOUT_MS,
		signal,
		shouldAllowNonZeroWithStdout,
	});
	if (result.type === "failed") {
		return { type: "failed", message: `${label} failed: ${result.detail}` };
	}
	try {
		return { type: "loaded", value: JSON.parse(result.stdout) };
	} catch {
		return { type: "failed", message: `${label} returned malformed JSON.` };
	}
}

function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function discussionCommentsEndpoint(
	identity: PrFeedbackWatchGithubPrIdentity,
	sinceIso: string | undefined,
): string {
	return buildGitHubRestEndpoint(
		`repos/${identity.owner}/${identity.repo}/issues/${identity.number}/comments`,
		{ per_page: 100, since: sinceIso },
	);
}

function reviewsEndpoint(identity: PrFeedbackWatchGithubPrIdentity): string {
	return buildGitHubRestEndpoint(
		`repos/${identity.owner}/${identity.repo}/pulls/${identity.number}/reviews`,
		{ per_page: 100 },
	);
}

function reviewCommentsEndpoint(
	identity: PrFeedbackWatchGithubPrIdentity,
	sinceIso: string | undefined,
): string {
	return buildGitHubRestEndpoint(
		`repos/${identity.owner}/${identity.repo}/pulls/${identity.number}/comments`,
		{ per_page: 100, sort: "updated", direction: "desc", since: sinceIso },
	);
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

export function skewIso(iso: string): string {
	const timestamp = Date.parse(iso);
	if (!Number.isFinite(timestamp)) return iso;
	return new Date(timestamp - REST_FINGERPRINT_SKEW_MS).toISOString();
}
