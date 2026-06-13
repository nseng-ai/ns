import { failure, ok, toMachineEnvelope } from "@asdl/clinkr";
import { z } from "zod";

import { buildFeedbackClassificationTemplate } from "./classification-core.ts";
import { reviewsForRequest } from "./feedback-collection.ts";
import { bodyLocatorSchema } from "./feedback-manifest-contracts.ts";
import type { PRDiscussionComment, PRReview, PRReviewThread, PrAddressGitHubGateway } from "./gateways.ts";
import { gatewayFailureResult, gatewayOptions } from "./operation-support.ts";
import type { ExecOperationDispatchResult, ExecOperationInvocation } from "./operation-registry.ts";
import { buildGetFeedbackPayloadManifest } from "./payload-manifest.ts";
import { PayloadStore, type PayloadReference } from "./payload-store.ts";

const DIRECT_REQUEST_MARKERS = ["please", "can you", "could you", "should", "needs", "need to", "fix", "update", "question"] as const;

const nullableStringSchema = z.string().nullable().default(null);

export const stackFeedbackPrInputSchema = z.looseObject({
	pr_number: z.number().int(),
	branch: z.string(),
	title: nullableStringSchema,
	url: nullableStringSchema,
	head_ref_name: nullableStringSchema,
	base_ref_name: nullableStringSchema,
});

export const stackFeedbackPrepInputSchema = z.looseObject({
	stack: z.array(stackFeedbackPrInputSchema),
});

const feedbackCountsSchema = z.looseObject({
	reviews: z.number().int(),
	review_threads: z.number().int(),
	unresolved_review_threads: z.number().int(),
	resolved_review_threads: z.number().int(),
	thread_comments: z.number().int(),
	discussion_comments: z.number().int(),
});

/** Typed window over the manifest this module builds itself via `buildGetFeedbackPayloadManifest`. */
const prepManifestViewSchema = z.looseObject({
	counts: feedbackCountsSchema,
	discussion_comments: z.array(z.looseObject({ comment_id: z.number().int(), body_locator: bodyLocatorSchema })),
});

const discussionTriageHintSchema = z.enum(["automation", "human_like", "needs_agent_review"]);
const discussionTriageReasonSchema = z.enum([
	"vercel_status",
	"graphite_status",
	"roaster_summary",
	"github_actions_status",
	"bot_status",
	"human_like",
	"direct_request_possible",
	"uncertain",
]);

export type StackFeedbackPrInput = z.infer<typeof stackFeedbackPrInputSchema>;
export type FeedbackCounts = z.infer<typeof feedbackCountsSchema>;

type DiscussionTriageHint = z.infer<typeof discussionTriageHintSchema>;
type DiscussionTriageReason = z.infer<typeof discussionTriageReasonSchema>;

export interface StackDiscussionTriageItem {
	comment_id: number;
	author: string;
	classification_hint: DiscussionTriageHint;
	reason: DiscussionTriageReason;
	body_locator: unknown;
}

export interface StackDiscussionTriageSummary {
	automation_like: number;
	human_like: number;
	needs_agent_review: number;
	by_reason: Record<string, number>;
	items: StackDiscussionTriageItem[];
}

export interface StackFeedbackPrepPrResult {
	pr_number: number;
	branch: string;
	title: string | null;
	url: string | null;
	head_ref_name: string | null;
	base_ref_name: string | null;
	manifest: unknown;
	manifest_summary_reference: PayloadReference;
	raw_feedback_reference: PayloadReference;
	classification_template: unknown;
	classification_template_reference: PayloadReference;
	counts: FeedbackCounts;
	discussion_triage: StackDiscussionTriageSummary;
}

export interface StackFeedbackPrepSummary {
	prs: number;
	reviews: number;
	unresolved_review_threads: number;
	discussion_comments: number;
	automation_discussion_comments: number;
	discussion_comments_needing_agent_review: number;
}

export interface StackFeedbackPrepResult {
	payload_session_id: string;
	include_resolved: boolean;
	stack: StackFeedbackPrepPrResult[];
	stack_summary_reference: PayloadReference | null;
	summary: StackFeedbackPrepSummary;
}

export interface StackFeedbackPrepCompactPrResult {
	pr_number: number;
	branch: string;
	title: string | null;
	url: string | null;
	head_ref_name: string | null;
	base_ref_name: string | null;
	counts: FeedbackCounts;
	raw_feedback_reference: PayloadReference;
	manifest_summary_reference: PayloadReference;
	classification_template_reference: PayloadReference;
	discussion_triage_summary: {
		automation_like: number;
		human_like: number;
		needs_agent_review: number;
		by_reason: Record<string, number>;
	};
}

export interface StackFeedbackPrepCompactResult {
	payload_session_id: string;
	include_resolved: boolean;
	summary: StackFeedbackPrepSummary;
	stack_summary_reference: PayloadReference;
	stack: StackFeedbackPrepCompactPrResult[];
}

export async function prepareStackFeedbackStack(options: {
	invocation: ExecOperationInvocation;
	store: PayloadStore;
	stack: readonly StackFeedbackPrInput[];
	github: PrAddressGitHubGateway;
	shouldIncludeResolved: boolean;
	shouldIncludeEmptyReviews: boolean;
}): Promise<{ type: "ok"; value: { result: StackFeedbackPrepResult; stackSummaryReference: PayloadReference } } | { type: "error"; result: ExecOperationDispatchResult }> {
	const prResults: StackFeedbackPrepPrResult[] = [];
	for (const prInput of options.stack) {
		const prepared = await prepareStackPr({
			invocation: options.invocation,
			store: options.store,
			prInput,
			github: options.github,
			shouldIncludeResolved: options.shouldIncludeResolved,
			shouldIncludeEmptyReviews: options.shouldIncludeEmptyReviews,
		});
		if (prepared.type === "error") return prepared;
		prResults.push(prepared.value);
	}

	const resultWithoutReference: StackFeedbackPrepResult = {
		payload_session_id: options.store.sessionId,
		include_resolved: options.shouldIncludeResolved,
		stack: prResults,
		stack_summary_reference: null,
		summary: prepSummary(prResults),
	};
	const stackSummaryReference = await options.store.writeJsonArtifact({ descriptor: "pr-address-stack-feedback-prep", role: "summary", payload: resultWithoutReference });
	if (stackSummaryReference.type === "error") return { type: "error", result: exitFailure(stackSummaryReference.errorType, stackSummaryReference.message) };
	return { type: "ok", value: { result: { ...resultWithoutReference, stack_summary_reference: stackSummaryReference.value }, stackSummaryReference: stackSummaryReference.value } };
}

async function prepareStackPr(options: {
	invocation: ExecOperationInvocation;
	store: PayloadStore;
	prInput: StackFeedbackPrInput;
	github: PrAddressGitHubGateway;
	shouldIncludeResolved: boolean;
	shouldIncludeEmptyReviews: boolean;
}): Promise<{ type: "ok"; value: StackFeedbackPrepPrResult } | { type: "error"; result: ExecOperationDispatchResult }> {
	const gatewayOptionsValue = gatewayOptions(options.invocation);
	const prNumber = options.prInput.pr_number;
	const reviewsResult = await options.github.getReviews(prNumber, gatewayOptionsValue);
	if (reviewsResult.type === "failure") return gatewayFailureResult(`Failed to fetch reviews for PR ${prNumber}`, reviewsResult.failure);
	const reviews = reviewsForRequest(reviewsResult.value, options.shouldIncludeEmptyReviews);
	const threadsResult = await options.github.getReviewThreads(prNumber, { ...gatewayOptionsValue, shouldIncludeResolved: options.shouldIncludeResolved });
	if (threadsResult.type === "failure") return gatewayFailureResult(`Failed to fetch review threads for PR ${prNumber}`, threadsResult.failure);
	const commentsResult = await options.github.getDiscussionComments(prNumber, gatewayOptionsValue);
	if (commentsResult.type === "failure") return gatewayFailureResult(`Failed to fetch discussion comments for PR ${prNumber}`, commentsResult.failure);

	const inlineResult = inlineFeedbackResult({ prNumber, reviews, reviewThreads: threadsResult.value, discussionComments: commentsResult.value });
	const rawReference = await options.store.writeJsonArtifact({
		descriptor: `pr-address-stack-feedback-pr-${prNumber}`,
		role: "raw",
		payload: toMachineEnvelope(ok(inlineResult)),
	});
	if (rawReference.type === "error") return { type: "error", result: exitFailure(rawReference.errorType, rawReference.message) };

	const manifest = buildGetFeedbackPayloadManifest({
		payload_reference: rawReference.value,
		pr_number: prNumber,
		reviews,
		review_threads: threadsResult.value,
		discussion_comments: commentsResult.value,
	});
	const manifestView = prepManifestViewSchema.parse(manifest);
	const templateResult = buildFeedbackClassificationTemplate(manifest);
	if (templateResult.type === "error") throw new Error(templateResult.message);

	const manifestReference = await options.store.writeJsonArtifact({ descriptor: `pr-address-stack-manifest-pr-${prNumber}`, role: "summary", payload: manifest });
	if (manifestReference.type === "error") return { type: "error", result: exitFailure(manifestReference.errorType, manifestReference.message) };
	const templateReference = await options.store.writeJsonArtifact({
		descriptor: `pr-address-stack-classification-template-pr-${prNumber}`,
		role: "summary",
		payload: templateResult.value,
	});
	if (templateReference.type === "error") return { type: "error", result: exitFailure(templateReference.errorType, templateReference.message) };

	return {
		type: "ok",
		value: {
			pr_number: prNumber,
			branch: options.prInput.branch,
			title: options.prInput.title,
			url: options.prInput.url,
			head_ref_name: options.prInput.head_ref_name,
			base_ref_name: options.prInput.base_ref_name,
			manifest,
			manifest_summary_reference: manifestReference.value,
			raw_feedback_reference: rawReference.value,
			classification_template: templateResult.value,
			classification_template_reference: templateReference.value,
			counts: manifestView.counts,
			discussion_triage: discussionTriageSummary(manifestView.discussion_comments, commentsResult.value),
		},
	};
}

/** Mirror the Python `GetFeedbackInlineResult` wire shape used for stack raw artifacts. */
function inlineFeedbackResult(options: {
	prNumber: number;
	reviews: readonly PRReview[];
	reviewThreads: readonly PRReviewThread[];
	discussionComments: readonly PRDiscussionComment[];
}): unknown {
	return {
		payload_mode: "inline",
		pr_number: options.prNumber,
		reviews: options.reviews,
		review_threads: options.reviewThreads,
		discussion_comments: options.discussionComments,
	};
}

function discussionTriageSummary(
	manifestComments: ReadonlyArray<{ comment_id: number; body_locator: unknown }>,
	discussionComments: readonly PRDiscussionComment[],
): StackDiscussionTriageSummary {
	const commentsById = new Map(discussionComments.map((comment) => [comment.id, comment]));
	const items: StackDiscussionTriageItem[] = [];
	for (const manifestComment of manifestComments) {
		const comment = commentsById.get(manifestComment.comment_id);
		if (comment === undefined) continue;
		const [hint, reason] = discussionTriageHint(comment.author.toLowerCase(), comment.body.toLowerCase());
		items.push({ comment_id: comment.id, author: comment.author, classification_hint: hint, reason, body_locator: manifestComment.body_locator });
	}
	return triageSummary(items);
}

function discussionTriageHint(author: string, body: string): [DiscussionTriageHint, DiscussionTriageReason] {
	if (author === "vercel[bot]" || body.includes("[vc]:")) return ["automation", "vercel_status"];
	if (body.includes("app.graphite.com") || body.includes("not mergeable via github")) return ["automation", "graphite_status"];
	if (body.includes("<!-- roaster:")) return ["automation", "roaster_summary"];
	if (author === "github-actions[bot]" || body.includes("github actions")) return ["automation", "github_actions_status"];
	if (DIRECT_REQUEST_MARKERS.some((marker) => body.includes(marker))) return ["needs_agent_review", "direct_request_possible"];
	if (author.endsWith("[bot]")) return ["automation", "bot_status"];
	if (author !== "") return ["human_like", "human_like"];
	return ["needs_agent_review", "uncertain"];
}

export function triageSummary(items: StackDiscussionTriageItem[]): StackDiscussionTriageSummary {
	const byReason: Record<string, number> = {};
	for (const item of items) byReason[item.reason] = (byReason[item.reason] ?? 0) + 1;
	return {
		automation_like: items.filter((item) => item.classification_hint === "automation").length,
		human_like: items.filter((item) => item.classification_hint === "human_like").length,
		needs_agent_review: items.filter((item) => item.classification_hint === "needs_agent_review").length,
		by_reason: byReason,
		items,
	};
}

function prepSummary(prResults: readonly StackFeedbackPrepPrResult[]): StackFeedbackPrepSummary {
	return {
		prs: prResults.length,
		reviews: prResults.reduce((total, item) => total + item.counts.reviews, 0),
		unresolved_review_threads: prResults.reduce((total, item) => total + item.counts.unresolved_review_threads, 0),
		discussion_comments: prResults.reduce((total, item) => total + item.counts.discussion_comments, 0),
		automation_discussion_comments: prResults.reduce((total, item) => total + item.discussion_triage.automation_like, 0),
		discussion_comments_needing_agent_review: prResults.reduce((total, item) => total + item.discussion_triage.needs_agent_review, 0),
	};
}

export function compactPrepResult(result: StackFeedbackPrepResult, stackSummaryReference: PayloadReference): StackFeedbackPrepCompactResult {
	return {
		payload_session_id: result.payload_session_id,
		include_resolved: result.include_resolved,
		summary: result.summary,
		stack_summary_reference: stackSummaryReference,
		stack: result.stack.map((prResult) => ({
			pr_number: prResult.pr_number,
			branch: prResult.branch,
			title: prResult.title,
			url: prResult.url,
			head_ref_name: prResult.head_ref_name,
			base_ref_name: prResult.base_ref_name,
			counts: prResult.counts,
			raw_feedback_reference: prResult.raw_feedback_reference,
			manifest_summary_reference: prResult.manifest_summary_reference,
			classification_template_reference: prResult.classification_template_reference,
			discussion_triage_summary: {
				automation_like: prResult.discussion_triage.automation_like,
				human_like: prResult.discussion_triage.human_like,
				needs_agent_review: prResult.discussion_triage.needs_agent_review,
				by_reason: prResult.discussion_triage.by_reason,
			},
		})),
	};
}

function exitFailure(errorType: string, message: string): ExecOperationDispatchResult {
	return { type: "exit", exit: failure(errorType, message) };
}
