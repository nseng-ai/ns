import { failure, ok, toMachineEnvelope, type ClinkrFailureExit } from "@asdl/clinkr";
import { buildFeedbackClassificationTemplate } from "./classification.ts";
import { type PrAddressExecContext } from "./exec-operation.ts";
import { buildGetFeedbackManifestFromSnapshot, type FeedbackSnapshot, fetchFeedbackSnapshot } from "./feedback-collection.ts";
import type { PRDiscussionComment, PRReview, PRReviewThread, PrAddressGitHubGateway } from "./gateways.ts";
import type { PayloadArtifactStore, PayloadReference } from "./payload-store.ts";
import { prArtifactDescriptor, stackArtifactDescriptor } from "./session-artifacts.ts";
import {
	prepManifestViewSchema,
	type StackFeedbackPrInput,
	type StackFeedbackPrepCompactResult,
	type StackFeedbackPrepPrResult,
	type StackFeedbackPrepResult,
	type StackFeedbackPrepSummary,
} from "./stack-feedback-prep-contracts.ts";
import { buildDiscussionTriageSummary } from "./stack-feedback-triage.ts";

export async function prepareStackFeedbackStack(options: {
	ctx: PrAddressExecContext;
	store: PayloadArtifactStore;
	stack: readonly StackFeedbackPrInput[];
	github: PrAddressGitHubGateway;
	shouldIncludeResolved: boolean;
	shouldIncludeEmptyReviews: boolean;
}): Promise<{ type: "ok"; value: { result: StackFeedbackPrepResult; stackSummaryReference: PayloadReference } } | { type: "error"; exit: ClinkrFailureExit }> {
	// Phase 1: fetch every PR's feedback concurrently; on failures, the first
	// failure in input order wins (await all, then scan — never race).
	const fetchResults = await Promise.all(
		options.stack.map((prInput) =>
			fetchStackPrFeedback({
				ctx: options.ctx,
				prInput,
				github: options.github,
				shouldIncludeResolved: options.shouldIncludeResolved,
				shouldIncludeEmptyReviews: options.shouldIncludeEmptyReviews,
			})),
	);
	const fetchedFeedback: StackPrFeedback[] = [];
	for (const fetchResult of fetchResults) {
		if (fetchResult.type === "error") return fetchResult;
		fetchedFeedback.push(fetchResult.value);
	}
	// Phase 2: write artifacts strictly sequentially in stack order so payload
	// sequence numbers and filenames stay byte-identical.
	const prResults: StackFeedbackPrepPrResult[] = [];
	for (const [index, prInput] of options.stack.entries()) {
		const feedback = fetchedFeedback[index];
		if (feedback === undefined) throw new Error(`Missing per-PR feedback at index ${index}`);
		const prepared = await writeStackPrArtifacts({
			store: options.store,
			prInput,
			feedback,
		});
		if (prepared.type === "error") return prepared;
		prResults.push(prepared.value);
	}

	const resultWithoutReference: StackFeedbackPrepResult = {
		harness_session_id: options.store.sessionId,
		include_resolved: options.shouldIncludeResolved,
		stack: prResults,
		stack_summary_reference: null,
		summary: prepSummary(prResults),
	};
	const stackSummaryReference = await options.store.writeJsonArtifact({ descriptor: stackArtifactDescriptor("prep"), role: "summary", payload: resultWithoutReference });
	if (stackSummaryReference.type === "error") return { type: "error", exit: failure(stackSummaryReference.errorType, stackSummaryReference.message) };
	return { type: "ok", value: { result: { ...resultWithoutReference, stack_summary_reference: stackSummaryReference.value }, stackSummaryReference: stackSummaryReference.value } };
}

interface StackPrFeedback {
	readonly snapshot: FeedbackSnapshot;
}

async function fetchStackPrFeedback(options: {
	ctx: PrAddressExecContext;
	prInput: StackFeedbackPrInput;
	github: PrAddressGitHubGateway;
	shouldIncludeResolved: boolean;
	shouldIncludeEmptyReviews: boolean;
}): Promise<{ type: "ok"; value: StackPrFeedback } | { type: "error"; exit: ClinkrFailureExit }> {
	const snapshotResult = await fetchFeedbackSnapshot({
		gateway: options.github,
		prNumber: options.prInput.pr_number,
		shouldIncludeResolved: options.shouldIncludeResolved,
		shouldIncludeEmptyReviews: options.shouldIncludeEmptyReviews,
		shouldCountAllReviewThreads: false,
		ctx: options.ctx,
	});
	if (snapshotResult.type === "error") return { type: "error", exit: snapshotResult.exit };
	return { type: "ok", value: { snapshot: snapshotResult.snapshot } };
}

async function writeStackPrArtifacts(options: {
	store: PayloadArtifactStore;
	prInput: StackFeedbackPrInput;
	feedback: StackPrFeedback;
}): Promise<{ type: "ok"; value: StackFeedbackPrepPrResult } | { type: "error"; exit: ClinkrFailureExit }> {
	const prNumber = options.prInput.pr_number;
	const snapshot = options.feedback.snapshot;
	const inlineResult = inlineFeedbackResult({
		prNumber,
		reviews: snapshot.reviews,
		reviewThreads: snapshot.review_threads,
		discussionComments: snapshot.discussion_comments,
	});
	const rawReference = await options.store.writeJsonArtifact({
		descriptor: prArtifactDescriptor({ prNumber, kind: "feedback" }),
		role: "raw",
		payload: toMachineEnvelope(ok(inlineResult)),
	});
	if (rawReference.type === "error") return { type: "error", exit: failure(rawReference.errorType, rawReference.message) };

	const manifest = buildGetFeedbackManifestFromSnapshot(snapshot, rawReference.value);
	const manifestView = prepManifestViewSchema.parse(manifest);
	const templateResult = buildFeedbackClassificationTemplate(manifest);
	if (templateResult.type === "error") throw new Error(templateResult.message);

	const manifestReference = await options.store.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber, kind: "manifest" }), role: "summary", payload: manifest });
	if (manifestReference.type === "error") return { type: "error", exit: failure(manifestReference.errorType, manifestReference.message) };
	const templateReference = await options.store.writeJsonArtifact({
		descriptor: prArtifactDescriptor({ prNumber, kind: "classification-template" }),
		role: "summary",
		payload: templateResult.value,
	});
	if (templateReference.type === "error") return { type: "error", exit: failure(templateReference.errorType, templateReference.message) };

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
			discussion_triage: buildDiscussionTriageSummary({ manifestComments: manifestView.discussion_comments, discussionComments: snapshot.discussion_comments }),
		},
	};
}

/** Build the stable inline feedback wire shape used for stack raw artifacts. */
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
		harness_session_id: result.harness_session_id,
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
