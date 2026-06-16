import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { fetchFeedbackSnapshot } from "./core/feedback-snapshot.ts";
import { buildSummarizeFeedbackResult } from "./core/feedback-summary.ts";
import { defineExecOperation, gatewayFailureExit, gatewayFailureMessage, gatewayOptions, type PrAddressExecContext } from "./exec-operation.ts";
import { compactOperationResult } from "./stdout-mode.ts";

const MAX_BODY_CHARS = 4000;
const DEFAULT_BODY_CHARS = 320;

const summarizeFeedbackParseSchema = z.object({
	pr_number: z.int(),
	include_resolved: z.boolean().default(false),
	include_empty_reviews: z.boolean().default(false),
	body_chars: z.int().default(DEFAULT_BODY_CHARS),
	harness_session_id: z.string().optional(),
});

type SummarizeFeedbackRequest = z.output<typeof summarizeFeedbackParseSchema>;

export const summarizeFeedbackOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "summarize-feedback",
		description: "Fetch compact PR feedback evidence without full raw review JSON.",
		schema: summarizeFeedbackParseSchema,
		positionals: { pr_number: { position: 0 } },
		handler: runSummarizeFeedbackOperation,
	},
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: ({ data, fullOutput }) => {
			const result = data as Record<string, unknown>;
			return {
				type: "ok",
				value: compactOperationResult({
					operation: "summarize-feedback",
					counts: asRecord(result.counts),
					artifacts: { full_output: fullOutput },
					details: compactSummarizeDetails(result),
				}),
			};
		},
	},
});

async function runSummarizeFeedbackOperation(ctx: PrAddressExecContext, request: SummarizeFeedbackRequest): Promise<ClinkrExit<unknown>> {
	const bodyChars = request.body_chars;
	// Range stays a handler check so the failure keeps its machine envelope;
	// integer-ness is clinkr strict-int (usage-error channel).
	if (bodyChars < 1 || bodyChars > MAX_BODY_CHARS) {
		return failure("invalid_request", `body_chars must be between 1 and ${MAX_BODY_CHARS}`);
	}

	const github = ctx.context.github;
	const lookupResult = await github.getPr(request.pr_number, gatewayOptions(ctx));
	if (lookupResult.type === "failure") {
		return failure("pr_gateway_failure", gatewayFailureMessage(`Failed to look up PR ${request.pr_number}`, lookupResult.failure));
	}
	if (lookupResult.type === "miss") {
		const data = {
			found: false,
			pr_number: request.pr_number,
			error: lookupResult.stderr,
			returncode: lookupResult.returncode,
		};
		return negative(`No PR found for PR ${request.pr_number}: ${lookupResult.stderr}`, data);
	}

	const snapshotResult = await fetchFeedbackSnapshot({
		gateway: github,
		gatewayOptions: gatewayOptions(ctx),
		prNumber: lookupResult.pr.number,
		shouldIncludeResolved: request.include_resolved,
		shouldIncludeEmptyReviews: request.include_empty_reviews,
		shouldCountAllReviewThreads: true,
	});
	if (snapshotResult.type === "failure") return gatewayFailureExit(snapshotResult.message, snapshotResult.failure);

	const result = buildSummarizeFeedbackResult(lookupResult.pr, snapshotResult.snapshot, bodyChars);
	return ok(result);
}

function compactSummarizeDetails(data: Record<string, unknown>): Record<string, unknown> {
	if (data.found === false) return { found: false, pr_number: data.pr_number, error: data.error, returncode: data.returncode };
	return {
		found: true,
		pr_number: data.pr_number,
		pr: data.pr,
		review_ids: Array.isArray(data.reviews) ? data.reviews.map((item) => (isRecord(item) ? item.id : null)).filter((value) => value !== null) : [],
		thread_ids: Array.isArray(data.review_threads) ? data.review_threads.map((item) => (isRecord(item) ? item.thread_id : null)).filter((value) => value !== null) : [],
		discussion_comment_ids: Array.isArray(data.discussion_comments) ? data.discussion_comments.map((item) => (isRecord(item) ? item.comment_id : null)).filter((value) => value !== null) : [],
	};
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

