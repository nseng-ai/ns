import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { githubPrIdentityFromUrl } from "@nseng-ai/capability-kit/github/identity";
import { RealGithubPrFeedbackGateway } from "@nseng-ai/capability-kit/github/pr-feedback";
import type { CommandRunner } from "@nseng-ai/foundation/exec";

import { isRecord, stringField } from "@nseng-ai/pi/runtime/primitives";
import { loadGhCommand } from "@nseng-ai/pi/shared/gh-command";

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

interface GhJsonCommandOptions {
	pi: ExecGateway;
	cwd: string;
	args: string[];
	label: string;
	signal?: AbortSignal;
	shouldAllowNonZeroWithStdout?: boolean;
}

type GhJsonCommandResult = { type: "loaded"; value: unknown } | { type: "failed"; message: string };

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
		...optionalEntry("signal", signal),
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
	const gateway = new RealGithubPrFeedbackGateway(execGatewayToCommandRunner(pi));
	const result = await gateway.getPrRestFeedbackFingerprintParts({
		cwd,
		prNumber: identity.number,
		...optionalEntry("sinceIso", sinceIso),
		...optionalEntry("signal", signal),
	});
	if (!result.ok) return { type: "failed", message: feedbackFailureMessage(result.error.message) };
	return {
		type: "loaded",
		fingerprint: buildFeedbackFingerprint([
			...parseDiscussionCommentFingerprint(
				result.value.discussionComments.map((comment) => ({
					id: comment.id,
					created_at: comment.createdAt,
					updated_at: comment.updatedAt,
					author: comment.author,
				})),
			),
			...parseReviewFingerprint(
				result.value.reviews.map((review) => ({
					id: review.id,
					node_id: review.nodeId,
					state: review.state,
					submitted_at: review.submittedAt,
					commit_id: review.commitId,
					author: review.author,
				})),
			),
			...parseReviewCommentFingerprint(
				result.value.reviewComments.map((comment) => ({
					id: comment.id,
					pull_request_review_id: comment.reviewId,
					created_at: comment.createdAt,
					updated_at: comment.updatedAt,
					path: comment.path,
					line: comment.line,
					in_reply_to_id: comment.inReplyToId,
					author: comment.author,
				})),
			),
		]),
	};
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

function execGatewayToCommandRunner(pi: ExecGateway): CommandRunner {
	return async (command, args, options = {}) => {
		const result = await pi.exec(command, [...args], options);
		return {
			stdout: result.stdout,
			stderr: result.stderr,
			code: result.code,
			killed: result.killed ?? false,
		};
	};
}

function feedbackFailureMessage(message: string): string {
	return `gh api failed: ${message}`;
}

export function skewIso(iso: string): string {
	const timestamp = Date.parse(iso);
	if (!Number.isFinite(timestamp)) return iso;
	return new Date(timestamp - REST_FINGERPRINT_SKEW_MS).toISOString();
}
