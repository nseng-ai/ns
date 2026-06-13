import { z } from "zod";

import { buildFeedbackClassificationTemplate } from "./classification-template.ts";
import { failure, ok, toMachineEnvelope, type ClinkrExit, type ClinkrFailureExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { reviewsForRequest } from "./feedback-collection.ts";
import type { GatewayFailure, PRDiscussionComment, PRReview, PRReviewThread, PrAddressGitHubGateway } from "./gateways.ts";
import { loadArtifactReference, loadJsonInput, type JsonInputResult } from "./json-input.ts";
import { gatewayFailureExit, gatewayOptions } from "./operation-support.ts";
import { buildGetFeedbackPayloadManifest } from "./payload-manifest.ts";
import { PayloadStore, type PayloadReference } from "./payload-store.ts";
import {
	DIRECT_REQUEST_MARKERS,
	pythonTupleRepr,
	stackFeedbackPrepInputSchema,
	triageSummary,
	type DiscussionTriageHint,
	type DiscussionTriageReason,
	type FeedbackCounts,
	type StackDiscussionTriageItem,
	type StackDiscussionTriageSummary,
	type StackFeedbackPrepPrResult,
	type StackFeedbackPrepResult,
	type StackFeedbackPrepSummary,
	type StackFeedbackPrInput,
} from "./stack-feedback-contracts.ts";
import { duplicateValues } from "./string-values.ts";

const stackFeedbackPrepParseSchema = z.object({
	stack_json: z.string().optional(),
	stack_reference: z.string().optional(),
	payload_session_id: z.string().optional(),
	stdout_mode: z.enum(["full", "compact"]).default("full"),
	include_resolved: z.boolean().default(false),
	include_empty_reviews: z.boolean().default(false),
});

export const stackFeedbackPrepOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "stack-feedback-prep",
		description: "Fetch stack PR feedback, write payload artifacts, and build classification templates.",
		schema: stackFeedbackPrepParseSchema,
		handler: runStackFeedbackPrepOperation,
	},
});

async function runStackFeedbackPrepOperation(ctx: PrAddressExecContext, request: z.output<typeof stackFeedbackPrepParseSchema>): Promise<ClinkrExit<unknown>> {
	// Python opens the payload store before reading the stack JSON; preserve that ordering.
	const storeResult = await PayloadStore.fromEnvironment({
		explicitSessionId: request.payload_session_id ?? null,
		env: ctx.env,
		clock: ctx.context.payloadClock,
	});
	if (storeResult.type === "error") return failure(storeResult.errorType, storeResult.message);
	const store = storeResult.value;

	const payloadResult = await resolvePrepStackInput({
		stackJson: request.stack_json,
		stackReference: request.stack_reference,
		stdin: ctx.stdin,
	});
	if (payloadResult.type === "error") return failure(payloadResult.error.errorType, payloadResult.error.message);

	const validationMessage = stackInputValidationMessage(payloadResult.value.stack);
	if (validationMessage !== null) return failure("invalid_request", validationMessage);

	const github = ctx.context.github;

	const shouldIncludeResolved = request.include_resolved;
	const shouldIncludeEmptyReviews = request.include_empty_reviews;
	// Phase 1: fetch every PR's feedback concurrently; on failures, the first
	// failure in input order wins (await all, then scan — never race).
	const fetchResults = await Promise.all(
		payloadResult.value.stack.map(async (prInput) => ({
			prInput,
			fetch: await fetchStackPrFeedback({
				ctx,
				prInput,
				github,
				shouldIncludeResolved,
				shouldIncludeEmptyReviews,
			}),
		})),
	);
	const prFetches: Array<{ prInput: StackFeedbackPrInput; feedback: StackPrFeedback }> = [];
	for (const { prInput, fetch } of fetchResults) {
		if (fetch.type === "error") return fetch.exit;
		prFetches.push({ prInput, feedback: fetch.value });
	}
	// Phase 2: write artifacts strictly sequentially in stack order so payload
	// sequence numbers and filenames stay byte-identical.
	const prResults: StackFeedbackPrepPrResult[] = [];
	for (const { prInput, feedback } of prFetches) {
		const prepared = await writeStackPrArtifacts({ store, prInput, feedback });
		if (prepared.type === "error") return prepared.exit;
		prResults.push(prepared.value);
	}

	const resultWithoutReference: StackFeedbackPrepResult = {
		payload_session_id: store.sessionId,
		include_resolved: shouldIncludeResolved,
		stack: prResults,
		stack_summary_reference: null,
		summary: prepSummary(prResults),
	};
	const stackSummaryReference = await store.writeJsonArtifact({ descriptor: "pr-address-stack-feedback-prep", role: "summary", payload: resultWithoutReference });
	if (stackSummaryReference.type === "error") return failure(stackSummaryReference.errorType, stackSummaryReference.message);
	const result: StackFeedbackPrepResult = { ...resultWithoutReference, stack_summary_reference: stackSummaryReference.value };
	if (request.stdout_mode === "compact") return ok(compactPrepResult(result, stackSummaryReference.value));
	return ok(result);
}

interface StackPrFeedback {
	readonly reviews: readonly PRReview[];
	readonly reviewThreads: readonly PRReviewThread[];
	readonly discussionComments: readonly PRDiscussionComment[];
}

async function fetchStackPrFeedback(options: {
	ctx: PrAddressExecContext;
	prInput: StackFeedbackPrInput;
	github: PrAddressGitHubGateway;
	shouldIncludeResolved: boolean;
	shouldIncludeEmptyReviews: boolean;
}): Promise<{ type: "ok"; value: StackPrFeedback } | { type: "error"; exit: ClinkrFailureExit }> {
	const gatewayOptionsValue = gatewayOptions(options.ctx);
	const prNumber = options.prInput.pr_number;
	const reviewsResult = await options.github.getReviews(prNumber, gatewayOptionsValue);
	if (reviewsResult.type === "failure") return gatewayError(`Failed to fetch reviews for PR ${prNumber}`, reviewsResult.failure);
	const reviews = reviewsForRequest(reviewsResult.value, options.shouldIncludeEmptyReviews);
	const threadsResult = await options.github.getReviewThreads(prNumber, { ...gatewayOptionsValue, shouldIncludeResolved: options.shouldIncludeResolved });
	if (threadsResult.type === "failure") return gatewayError(`Failed to fetch review threads for PR ${prNumber}`, threadsResult.failure);
	const commentsResult = await options.github.getDiscussionComments(prNumber, gatewayOptionsValue);
	if (commentsResult.type === "failure") return gatewayError(`Failed to fetch discussion comments for PR ${prNumber}`, commentsResult.failure);
	return { type: "ok", value: { reviews, reviewThreads: threadsResult.value, discussionComments: commentsResult.value } };
}

async function writeStackPrArtifacts(options: {
	store: PayloadStore;
	prInput: StackFeedbackPrInput;
	feedback: StackPrFeedback;
}): Promise<{ type: "ok"; value: StackFeedbackPrepPrResult } | { type: "error"; exit: ClinkrFailureExit }> {
	const prNumber = options.prInput.pr_number;
	const { reviews, reviewThreads, discussionComments } = options.feedback;
	const inlineResult = inlineFeedbackResult({ prNumber, reviews, reviewThreads, discussionComments });
	const rawReference = await options.store.writeJsonArtifact({
		descriptor: `pr-address-stack-feedback-pr-${prNumber}`,
		role: "raw",
		payload: toMachineEnvelope(ok(inlineResult)),
	});
	if (rawReference.type === "error") return { type: "error", exit: failure(rawReference.errorType, rawReference.message) };

	const manifest = buildGetFeedbackPayloadManifest({
		payload_reference: rawReference.value,
		pr_number: prNumber,
		reviews,
		review_threads: reviewThreads,
		discussion_comments: discussionComments,
	});
	const { counts, discussion_comments: discussionManifestComments } = manifest;
	const templateResult = buildFeedbackClassificationTemplate(manifest);
	if (templateResult.type === "error") throw new Error(templateResult.message);

	const manifestReference = await options.store.writeJsonArtifact({ descriptor: `pr-address-stack-manifest-pr-${prNumber}`, role: "summary", payload: manifest });
	if (manifestReference.type === "error") return { type: "error", exit: failure(manifestReference.errorType, manifestReference.message) };
	const templateReference = await options.store.writeJsonArtifact({
		descriptor: `pr-address-stack-classification-template-pr-${prNumber}`,
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
			counts,
			discussion_triage: discussionTriageSummary(discussionManifestComments, discussionComments),
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

async function resolvePrepStackInput(options: {
	stackJson: string | undefined;
	stackReference: string | undefined;
	stdin: () => Promise<string>;
}): Promise<JsonInputResult<{ stack: StackFeedbackPrInput[] }>> {
	if (options.stackReference === undefined) {
		return await loadJsonInput({
			optionValue: options.stackJson,
			commandName: "stack-feedback-prep",
			inputDescription: "stack JSON payload",
			optionName: "--stack-json",
			schema: stackFeedbackPrepInputSchema,
			stdin: options.stdin,
		});
	}
	if (options.stackJson !== undefined) {
		return {
			type: "error",
			error: { errorType: "invalid_request", message: "stack-feedback-prep cannot mix --stack-json with --stack-reference; pass exactly one stack source." },
		};
	}
	return await loadArtifactReference({
		filePath: options.stackReference,
		commandName: "stack-feedback-prep",
		optionName: "--stack-reference",
		artifactDescription: "a stack JSON payload",
		schema: stackFeedbackPrepInputSchema,
	});
}

function stackInputValidationMessage(stack: readonly StackFeedbackPrInput[]): string | null {
	if (stack.length === 0) return "stack-feedback-prep requires at least one stack PR.";
	const duplicatePrs = duplicateValues(stack.map((item) => item.pr_number));
	if (duplicatePrs.length > 0) return `stack-feedback-prep stack contains duplicate PR numbers: ${pythonTupleRepr(duplicatePrs)}`;
	if (!stack.every((item) => item.branch.trim() !== "")) return "stack-feedback-prep requires every stack PR branch to be non-empty.";
	const duplicateBranches = duplicateValues(stack.map((item) => item.branch));
	if (duplicateBranches.length > 0) return `stack-feedback-prep stack contains duplicate branches: ${pythonTupleRepr(duplicateBranches)}`;
	return null;
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

function compactPrepResult(result: StackFeedbackPrepResult, stackSummaryReference: PayloadReference): unknown {
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

function gatewayError(prefix: string, gatewayFailure: GatewayFailure): { type: "error"; exit: ClinkrFailureExit } {
	return { type: "error", exit: gatewayFailureExit(prefix, gatewayFailure) };
}
