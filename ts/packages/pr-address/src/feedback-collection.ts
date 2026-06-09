import { z } from "zod";

import { clinkrFailure, clinkrOk, toMachineEnvelope } from "./clinkr-envelope.ts";
import type { GatewayFailure, PRDiscussionComment, PRReview, PRReviewThread, PrAddressGitHubGateway } from "./gateways.ts";
import { buildGetFeedbackPayloadManifest } from "./payload-manifest.ts";
import { PayloadStore } from "./payload-store.ts";
import type { ExecOperationDispatchResult, ExecOperationInvocation } from "./operation-registry.ts";

const SILENCEABLE_EMPTY_REVIEW_STATES = new Set(["COMMENTED", "APPROVED"]);
const resolutionMarker = "<!-- pr-address:resolved -->";

export interface FeedbackSnapshot {
	pr_number: number;
	reviews: readonly PRReview[];
	review_threads: readonly PRReviewThread[];
	counted_review_threads: readonly PRReviewThread[];
	discussion_comments: readonly PRDiscussionComment[];
}

export interface ParsedReadOptions {
	positionals: readonly string[];
	values: ReadonlyMap<string, string>;
	flags: ReadonlySet<string>;
}

export async function runGetFeedbackOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	const parsed = parsePrNumberOperation({
		args: invocation.args,
		commandName: "get-feedback",
		flagOptions: ["--include-resolved", "--include-empty-reviews"],
		valueOptions: ["--payload-mode", "--payload-session-id"],
	});
	if (parsed.type === "error") return parsed.result;
	const payloadMode = parsed.values.get("--payload-mode") ?? "payload";
	// Invalid --payload-mode values keep legacy click usage-error behavior.
	if (payloadMode !== "inline" && payloadMode !== "payload") return { type: "fallback" };

	// Python opens the payload store before any gateway fetch; preserve that ordering.
	let store: PayloadStore | undefined;
	if (payloadMode === "payload") {
		const storeResult = await PayloadStore.fromEnvironment({
			explicitSessionId: parsed.values.get("--payload-session-id") ?? null,
			env: invocation.deps.env,
			clock: invocation.deps.context.payloadClock,
		});
		if (storeResult.type === "error") return { type: "exit", exit: clinkrFailure(storeResult.errorType, storeResult.message) };
		store = storeResult.value;
	}

	const gateway = githubGateway(invocation);
	if (gateway.type === "error") return gateway.result;
	const snapshotResult = await fetchFeedbackSnapshot({
		gateway: gateway.gateway,
		prNumber: parsed.prNumber,
		shouldIncludeResolved: parsed.flags.has("--include-resolved"),
		shouldIncludeEmptyReviews: parsed.flags.has("--include-empty-reviews"),
		shouldCountAllReviewThreads: false,
		invocation,
	});
	if (snapshotResult.type === "error") return snapshotResult.result;
	const snapshot = snapshotResult.snapshot;
	const inlineResult = {
		payload_mode: "inline",
		pr_number: snapshot.pr_number,
		reviews: snapshot.reviews,
		review_threads: snapshot.review_threads,
		discussion_comments: snapshot.discussion_comments,
	};
	if (store === undefined) return { type: "exit", exit: clinkrOk(inlineResult) };

	const rawReference = await store.writeJsonArtifact({
		descriptor: `pr-address-get-feedback-pr-${snapshot.pr_number}`,
		role: "raw",
		payload: toMachineEnvelope(clinkrOk(inlineResult)),
	});
	if (rawReference.type === "error") return { type: "exit", exit: clinkrFailure(rawReference.errorType, rawReference.message) };
	return { type: "exit", exit: clinkrOk(buildGetFeedbackManifestFromSnapshot(snapshot, rawReference.value)) };
}

export function buildGetFeedbackManifestFromSnapshot(snapshot: FeedbackSnapshot, payloadReference: unknown): unknown {
	return buildGetFeedbackPayloadManifest({
		payload_reference: payloadReference,
		pr_number: snapshot.pr_number,
		reviews: snapshot.reviews,
		review_threads: snapshot.review_threads,
		discussion_comments: snapshot.discussion_comments,
	});
}

export async function fetchFeedbackSnapshot(options: {
	gateway: PrAddressGitHubGateway;
	prNumber: number;
	shouldIncludeResolved: boolean;
	shouldIncludeEmptyReviews: boolean;
	shouldCountAllReviewThreads: boolean;
	invocation: ExecOperationInvocation;
}): Promise<{ type: "ok"; snapshot: FeedbackSnapshot } | { type: "error"; result: ExecOperationDispatchResult }> {
	const gatewayOptionsValue = gatewayOptions(options.invocation);
	const reviewsResult = await options.gateway.getReviews(options.prNumber, gatewayOptionsValue);
	if (reviewsResult.type === "failure") return gatewayFailureResult(`Failed to fetch reviews for PR ${options.prNumber}`, reviewsResult.failure);
	let countedReviewThreads: readonly PRReviewThread[];
	let reviewThreads: readonly PRReviewThread[];
	if (options.shouldCountAllReviewThreads) {
		const countedResult = await options.gateway.getReviewThreads(options.prNumber, { ...gatewayOptionsValue, shouldIncludeResolved: true });
		if (countedResult.type === "failure") return gatewayFailureResult(`Failed to fetch review threads for PR ${options.prNumber}`, countedResult.failure);
		countedReviewThreads = countedResult.value;
		reviewThreads = options.shouldIncludeResolved ? countedReviewThreads : countedReviewThreads.filter((thread) => !thread.is_resolved);
	} else {
		const threadsResult = await options.gateway.getReviewThreads(options.prNumber, { ...gatewayOptionsValue, shouldIncludeResolved: options.shouldIncludeResolved });
		if (threadsResult.type === "failure") return gatewayFailureResult(`Failed to fetch review threads for PR ${options.prNumber}`, threadsResult.failure);
		reviewThreads = threadsResult.value;
		countedReviewThreads = reviewThreads;
	}
	const commentsResult = await options.gateway.getDiscussionComments(options.prNumber, gatewayOptionsValue);
	if (commentsResult.type === "failure") return gatewayFailureResult(`Failed to fetch discussion comments for PR ${options.prNumber}`, commentsResult.failure);
	return {
		type: "ok",
		snapshot: {
			pr_number: options.prNumber,
			reviews: reviewsForRequest(reviewsResult.value, options.shouldIncludeEmptyReviews),
			review_threads: reviewThreads,
			counted_review_threads: countedReviewThreads,
			discussion_comments: commentsResult.value,
		},
	};
}

export function reviewsForRequest(reviews: readonly PRReview[], shouldIncludeEmptyReviews: boolean): readonly PRReview[] {
	if (shouldIncludeEmptyReviews) return reviews;
	return reviews.filter((review) => !isEmptyReview(review));
}

function isEmptyReview(review: PRReview): boolean {
	return SILENCEABLE_EMPTY_REVIEW_STATES.has(review.state) && review.body.trim() === "";
}

export function contestedThreadIds(reviewThreads: readonly PRReviewThread[]): readonly string[] {
	const contested: string[] = [];
	for (const thread of reviewThreads) {
		if (!thread.is_resolved) continue;
		const markerIndexes: number[] = [];
		thread.comments.forEach((comment, index) => {
			if (comment.body.includes(resolutionMarker)) markerIndexes.push(index);
		});
		const lastMarkerIndex = markerIndexes.at(-1);
		if (lastMarkerIndex !== undefined && lastMarkerIndex < thread.comments.length - 1) contested.push(thread.id);
	}
	return contested;
}

export interface ParsePrNumberOperationOptions {
	args: readonly string[];
	commandName: string;
	flagOptions?: readonly string[];
	valueOptions?: readonly string[];
}

export function parsePrNumberOperation(options: ParsePrNumberOperationOptions): { type: "ok"; prNumber: number; flags: ReadonlySet<string>; values: ReadonlyMap<string, string> } | { type: "error"; result: ExecOperationDispatchResult } {
	const parsed = parseReadOptions(options.args, options.valueOptions ?? [], options.flagOptions ?? []);
	if (parsed.type === "error") return { type: "error", result: { type: "exit", exit: clinkrFailure("invalid_request", parsed.message) } };
	const rawPrNumber = parsed.options.positionals[0];
	const prNumber = rawPrNumber === undefined ? Number.NaN : Number(rawPrNumber);
	if (!Number.isInteger(prNumber)) return { type: "error", result: { type: "exit", exit: clinkrFailure("invalid_request", `${options.commandName} requires an integer PR number argument.`) } };
	return { type: "ok", prNumber, flags: parsed.options.flags, values: parsed.options.values };
}

export function parseReadOptions(
	args: readonly string[],
	valueOptions: readonly string[],
	flagOptions: readonly string[],
): { type: "ok"; options: ParsedReadOptions } | { type: "error"; message: string } {
	const positionals: string[] = [];
	const values = new Map<string, string>();
	const flags = new Set<string>();
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) continue;
		if (arg === "--format") {
			index += 1;
			continue;
		}
		if (valueOptions.includes(arg)) {
			const value = args[index + 1];
			if (value === undefined) return { type: "error", message: `${arg} requires a value.` };
			values.set(arg, value);
			index += 1;
			continue;
		}
		if (flagOptions.includes(arg)) {
			flags.add(arg);
			continue;
		}
		if (arg.startsWith("--")) return { type: "error", message: `Unknown option for managed pr-address operation: ${arg}` };
		positionals.push(arg);
	}
	return { type: "ok", options: { positionals, values, flags } };
}

export function githubGateway(invocation: ExecOperationInvocation): { type: "ok"; gateway: PrAddressGitHubGateway } | { type: "error"; result: ExecOperationDispatchResult } {
	const gateway = invocation.deps.context.github;
	if (gateway === undefined) {
		return { type: "error", result: { type: "exit", exit: clinkrFailure("missing_gateway", "This TypeScript pr-address operation requires a GitHub gateway.") } };
	}
	return { type: "ok", gateway };
}

export function gatewayOptions(invocation: ExecOperationInvocation): { cwd: string; env: NodeJS.ProcessEnv } {
	return { cwd: invocation.deps.cwd, env: invocation.deps.env };
}

function gatewayFailureResult(prefix: string, failure: GatewayFailure): { type: "error"; result: ExecOperationDispatchResult } {
	return { type: "error", result: { type: "exit", exit: clinkrFailure("pr_gateway_failure", gatewayFailureMessage(prefix, failure)) } };
}

export function gatewayFailureDetail(failure: GatewayFailure): string {
	return failure.stderr || failure.stdout || `exit code ${failure.returncode}`;
}

export function gatewayFailureMessage(prefix: string, failure: GatewayFailure): string {
	return `${prefix}: ${gatewayFailureDetail(failure)}`;
}

export const getFeedbackInlineResultSchema = z.looseObject({
	payload_mode: z.literal("inline"),
	pr_number: z.number().int(),
	reviews: z.array(z.unknown()),
	review_threads: z.array(z.unknown()),
	discussion_comments: z.array(z.unknown()),
});
