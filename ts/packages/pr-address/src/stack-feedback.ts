import { z } from "zod";

import {
	buildFeedbackClassificationTemplate,
	planFeedback,
	validateFeedbackClassification,
	type FeedbackClassificationValidationError,
	type FeedbackClassificationValidationResult,
	type FeedbackPlanningResult,
} from "./classification-core.ts";
import { clinkrFailure, clinkrNegative, clinkrOk, toMachineEnvelope, type ClinkrExit } from "./clinkr-envelope.ts";
import { gatewayFailureMessage, gatewayOptions, githubGateway, parseReadOptions, reviewsForRequest } from "./feedback-collection.ts";
import { bodyLocatorSchema } from "./feedback-manifest-contracts.ts";
import { ACTION_COMPLEXITIES, type ActionComplexity, type FeedbackPlanActionItem, type FeedbackPlanBatch, type FeedbackPlanInformationalItem } from "./feedback-plan-contracts.ts";
import type { GatewayFailure, PRDiscussionComment, PRReview, PRReviewThread, PrAddressGitHubGateway } from "./gateways.ts";
import { loadJsonInput } from "./json-input.ts";
import { buildGetFeedbackPayloadManifest } from "./payload-manifest.ts";
import { PayloadStore, type PayloadReference } from "./payload-store.ts";
import type { ExecOperationDispatchResult, ExecOperationInvocation } from "./operation-registry.ts";

const STDOUT_MODES = new Set(["full", "compact"]);
const APPROVAL_REQUIRED_COMPLEXITIES = new Set<ActionComplexity>(["cross_cutting", "complex"]);
const DIRECT_REQUEST_MARKERS = ["please", "can you", "could you", "should", "needs", "need to", "fix", "update", "question"] as const;

const nullableStringSchema = z.string().nullable().default(null);

const stackFeedbackPrInputSchema = z.looseObject({
	pr_number: z.number().int(),
	branch: z.string(),
	title: nullableStringSchema,
	url: nullableStringSchema,
	head_ref_name: nullableStringSchema,
	base_ref_name: nullableStringSchema,
});

const stackFeedbackPrepInputSchema = z.looseObject({
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

const stackDiscussionTriageItemSchema = z.looseObject({
	comment_id: z.number().int(),
	author: z.string(),
	classification_hint: discussionTriageHintSchema,
	reason: discussionTriageReasonSchema,
	body_locator: z.unknown(),
});

const stackPrepDiscussionTriageSchema = z.looseObject({
	automation_like: z.number().int().default(0),
	human_like: z.number().int().default(0),
	needs_agent_review: z.number().int().default(0),
	by_reason: z.record(z.string(), z.number().int()).default({}),
	items: z.array(stackDiscussionTriageItemSchema).default([]),
});

const stackPrepPrResultSchema = z.looseObject({
	pr_number: z.number().int(),
	branch: z.string(),
	title: nullableStringSchema,
	url: nullableStringSchema,
	head_ref_name: nullableStringSchema,
	base_ref_name: nullableStringSchema,
	manifest: z.unknown(),
	discussion_triage: stackPrepDiscussionTriageSchema,
});

const stackPrepResultInputSchema = z.looseObject({
	payload_session_id: z.string(),
	include_resolved: z.boolean().default(false),
	stack: z.array(stackPrepPrResultSchema),
});

const stackFeedbackPlanInputSchema = z.looseObject({
	prep: stackPrepResultInputSchema,
	classifications: z.array(z.looseObject({ pr_number: z.number().int(), classification: z.record(z.string(), z.unknown()) })),
});

type StackFeedbackPrInput = z.infer<typeof stackFeedbackPrInputSchema>;
type StackPrepPrResultInput = z.infer<typeof stackPrepPrResultSchema>;
type StackFeedbackPlanInput = z.infer<typeof stackFeedbackPlanInputSchema>;
type FeedbackCounts = z.infer<typeof feedbackCountsSchema>;

type DiscussionTriageHint = z.infer<typeof discussionTriageHintSchema>;
type DiscussionTriageReason = z.infer<typeof discussionTriageReasonSchema>;
type DecisionKind = "approval_required_action" | "informational_review_thread" | "discussion_comment_action" | "discussion_comment_review";

interface StackDiscussionTriageItem {
	comment_id: number;
	author: string;
	classification_hint: DiscussionTriageHint;
	reason: DiscussionTriageReason;
	body_locator: unknown;
}

interface StackDiscussionTriageSummary {
	automation_like: number;
	human_like: number;
	needs_agent_review: number;
	by_reason: Record<string, number>;
	items: StackDiscussionTriageItem[];
}

interface StackFeedbackPrepPrResult {
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

interface StackFeedbackPrepSummary {
	prs: number;
	reviews: number;
	unresolved_review_threads: number;
	discussion_comments: number;
	automation_discussion_comments: number;
	discussion_comments_needing_agent_review: number;
}

interface StackFeedbackPrepResult {
	payload_session_id: string;
	include_resolved: boolean;
	stack: StackFeedbackPrepPrResult[];
	stack_summary_reference: PayloadReference | null;
	summary: StackFeedbackPrepSummary;
}

interface StackFeedbackPlanValidationPrResult {
	pr_number: number;
	valid: boolean;
	counts: FeedbackClassificationValidationResult["counts"];
	errors: FeedbackClassificationValidationError[];
}

interface StackFeedbackPlanValidationSummary {
	all_valid: boolean;
	per_pr: StackFeedbackPlanValidationPrResult[];
}

interface StackFeedbackPlanItem {
	pr_number: number;
	branch: string;
	title: string | null;
	url: string | null;
	source_batch_id: string | null;
	source_kind: string;
	summary: string;
	action_summary: string | null;
	complexity: string | null;
	approval_required: boolean;
	review_id: string | null;
	review_state: string | null;
	submitted_at: string | null;
	thread_id: string | null;
	discussion_comment_id: number | null;
	covered_comment_ids: number[];
	body_locator: unknown | null;
	thread_item_pointer: string | null;
	path: string | null;
	line: number | null;
	start_line: number | null;
	is_outdated: boolean | null;
	author: string | null;
	needs_reply: boolean | null;
}

interface StackFeedbackPlanBatch {
	batch_id: string;
	complexity: string;
	approval_required: boolean;
	items: StackFeedbackPlanItem[];
}

interface StackFeedbackPlanInformationalItem {
	pr_number: number;
	branch: string;
	title: string | null;
	url: string | null;
	source_kind: string;
	summary: string;
	informational_reason: string;
	user_decision_required: boolean;
	allowed_decisions: string[];
	review_id: string | null;
	review_state: string | null;
	submitted_at: string | null;
	thread_id: string | null;
	discussion_comment_id: number | null;
	covered_comment_ids: number[];
	body_locator: unknown | null;
	thread_item_pointer: string | null;
	path: string | null;
	line: number | null;
	start_line: number | null;
	is_outdated: boolean | null;
	author: string | null;
}

interface StackFeedbackDecisionDocketItem {
	decision_kind: DecisionKind;
	pr_number: number;
	branch: string;
	title: string | null;
	url: string | null;
	source_kind: string;
	thread_id: string | null;
	discussion_comment_id: number | null;
	path: string | null;
	line: number | null;
	summary: string;
	action_summary: string | null;
	recommended_decision: string;
	approval_required: boolean;
}

interface StackFeedbackAutomationDiscussionSummary {
	automation_like: number;
	human_like: number;
	needs_agent_review: number;
	by_reason: Record<string, number>;
}

interface StackFeedbackPlanSummary {
	actionable_items: number;
	approval_required_items: number;
	informational_items: number;
	automation_discussion_comments: number;
}

interface StackFeedbackPlanResult {
	valid: boolean;
	payload_session_id: string;
	pr_count: number;
	validation: StackFeedbackPlanValidationSummary;
	batches: StackFeedbackPlanBatch[];
	informational: StackFeedbackPlanInformationalItem[];
	automation_discussion_summary: StackFeedbackAutomationDiscussionSummary | null;
	decision_docket: StackFeedbackDecisionDocketItem[];
	stack_plan_reference: PayloadReference | null;
	summary: StackFeedbackPlanSummary | null;
}

export async function runStackFeedbackPrepOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	const parsed = parseReadOptions(invocation.args, ["--stack-json", "--payload-session-id", "--stdout-mode"], ["--include-resolved", "--include-empty-reviews"]);
	if (parsed.type === "error") return exitFailure("invalid_request", parsed.message);
	const unexpectedPositional = parsed.options.positionals[0];
	if (unexpectedPositional !== undefined) return exitFailure("invalid_request", `Unexpected argument for stack-feedback-prep: ${unexpectedPositional}`);
	const stdoutMode = parsed.options.values.get("--stdout-mode") ?? "full";
	if (!STDOUT_MODES.has(stdoutMode)) {
		return exitFailure("invalid_request", `--stdout-mode must be 'full' or 'compact', got '${stdoutMode}'.`);
	}

	// Python opens the payload store before reading the stack JSON; preserve that ordering.
	const storeResult = await PayloadStore.fromEnvironment({
		explicitSessionId: parsed.options.values.get("--payload-session-id") ?? null,
		env: invocation.deps.env,
		clock: invocation.deps.context.payloadClock,
	});
	if (storeResult.type === "error") return exitFailure(storeResult.errorType, storeResult.message);
	const store = storeResult.value;

	const payloadResult = await loadJsonInput({
		optionValue: parsed.options.values.get("--stack-json"),
		commandName: "stack-feedback-prep",
		inputDescription: "stack JSON payload",
		optionName: "--stack-json",
		schema: stackFeedbackPrepInputSchema,
		stdin: invocation.deps.stdin,
	});
	if (payloadResult.type === "error") return exitFailure(payloadResult.error.errorType, payloadResult.error.message);

	const validationMessage = stackInputValidationMessage(payloadResult.value.stack);
	if (validationMessage !== null) return exitFailure("invalid_request", validationMessage);

	const github = githubGateway(invocation);
	if (github.type === "error") return github.result;

	const shouldIncludeResolved = parsed.options.flags.has("--include-resolved");
	const shouldIncludeEmptyReviews = parsed.options.flags.has("--include-empty-reviews");
	const prResults: StackFeedbackPrepPrResult[] = [];
	for (const prInput of payloadResult.value.stack) {
		const prepared = await prepareStackPr({
			invocation,
			store,
			prInput,
			github: github.gateway,
			shouldIncludeResolved,
			shouldIncludeEmptyReviews,
		});
		if (prepared.type === "error") return prepared.result;
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
	if (stackSummaryReference.type === "error") return exitFailure(stackSummaryReference.errorType, stackSummaryReference.message);
	const result: StackFeedbackPrepResult = { ...resultWithoutReference, stack_summary_reference: stackSummaryReference.value };
	if (stdoutMode === "compact") return { type: "exit", exit: clinkrOk(compactPrepResult(result, stackSummaryReference.value)) };
	return { type: "exit", exit: clinkrOk(result) };
}

export async function runStackFeedbackPlanOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	const parsed = parseReadOptions(invocation.args, ["--payload-json", "--payload-session-id", "--stdout-mode"], []);
	if (parsed.type === "error") return exitFailure("invalid_request", parsed.message);
	const unexpectedPositional = parsed.options.positionals[0];
	if (unexpectedPositional !== undefined) return exitFailure("invalid_request", `Unexpected argument for stack-feedback-plan: ${unexpectedPositional}`);
	const stdoutMode = parsed.options.values.get("--stdout-mode") ?? "full";
	if (!STDOUT_MODES.has(stdoutMode)) {
		return exitFailure("invalid_request", `--stdout-mode must be 'full' or 'compact', got '${stdoutMode}'.`);
	}

	// Python opens the payload store before reading the plan payload; preserve that ordering.
	const storeResult = await PayloadStore.fromEnvironment({
		explicitSessionId: parsed.options.values.get("--payload-session-id") ?? null,
		env: invocation.deps.env,
		clock: invocation.deps.context.payloadClock,
	});
	if (storeResult.type === "error") return exitFailure(storeResult.errorType, storeResult.message);
	const store = storeResult.value;

	const payloadResult = await loadJsonInput({
		optionValue: parsed.options.values.get("--payload-json"),
		commandName: "stack-feedback-plan",
		inputDescription: "stack feedback plan JSON payload",
		optionName: "--payload-json",
		schema: stackFeedbackPlanInputSchema,
		stdin: invocation.deps.stdin,
	});
	if (payloadResult.type === "error") return exitFailure(payloadResult.error.errorType, payloadResult.error.message);
	const payload = payloadResult.value;

	const classificationsResult = classificationsByPr(payload);
	if (classificationsResult.type === "error") return exitFailure("invalid_request", classificationsResult.message);
	const classificationByPr = classificationsResult.value;

	const validations = payload.prep.stack.map((prResult) => validateFeedbackClassification({ manifest: prResult.manifest, classification: classificationByPr.get(prResult.pr_number) }));
	const validationSummary: StackFeedbackPlanValidationSummary = {
		all_valid: validations.every((validation) => validation.valid),
		per_pr: payload.prep.stack.map((prResult, index) => {
			const validation = requiredAt(validations, index);
			return {
				pr_number: pythonOrPrNumber(validation.pr_number, prResult.pr_number),
				valid: validation.valid,
				counts: validation.counts,
				errors: validation.errors,
			};
		}),
	};
	if (!validationSummary.all_valid) {
		const negativeResult = emptyPlanResult({ sessionId: store.sessionId, prCount: payload.prep.stack.length, validation: validationSummary });
		const negativeExit: ClinkrExit = clinkrNegative(
			stdoutMode === "compact" ? compactPlanResult(negativeResult) : negativeResult,
			"Stack feedback classification failed validation; no stack plan produced.",
		);
		return { type: "exit", exit: negativeExit };
	}

	const perPrPlans = payload.prep.stack.map((prResult) => planFeedback({ manifest: prResult.manifest, classification: classificationByPr.get(prResult.pr_number) }));
	if (!perPrPlans.every((plan) => plan.valid)) throw new Error("validated stack classifications must produce valid per-PR plans");
	const resultWithoutReference = mergedStackPlanResult({
		sessionId: store.sessionId,
		prep: payload.prep,
		validation: validationSummary,
		perPrPlans,
	});
	const stackPlanReference = await store.writeJsonArtifact({ descriptor: "pr-address-stack-feedback-plan", role: "summary", payload: resultWithoutReference });
	if (stackPlanReference.type === "error") return exitFailure(stackPlanReference.errorType, stackPlanReference.message);
	const result: StackFeedbackPlanResult = { ...resultWithoutReference, stack_plan_reference: stackPlanReference.value };
	if (stdoutMode === "compact") return { type: "exit", exit: clinkrOk(compactPlanResult(result)) };
	return { type: "exit", exit: clinkrOk(result) };
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
	if (reviewsResult.type === "failure") return gatewayError(`Failed to fetch reviews for PR ${prNumber}`, reviewsResult.failure);
	const reviews = reviewsForRequest(reviewsResult.value, options.shouldIncludeEmptyReviews);
	const threadsResult = await options.github.getReviewThreads(prNumber, { ...gatewayOptionsValue, shouldIncludeResolved: options.shouldIncludeResolved });
	if (threadsResult.type === "failure") return gatewayError(`Failed to fetch review threads for PR ${prNumber}`, threadsResult.failure);
	const commentsResult = await options.github.getDiscussionComments(prNumber, gatewayOptionsValue);
	if (commentsResult.type === "failure") return gatewayError(`Failed to fetch discussion comments for PR ${prNumber}`, commentsResult.failure);

	const inlineResult = inlineFeedbackResult({ prNumber, reviews, reviewThreads: threadsResult.value, discussionComments: commentsResult.value });
	const rawReference = await options.store.writeJsonArtifact({
		descriptor: `pr-address-stack-feedback-pr-${prNumber}`,
		role: "raw",
		payload: toMachineEnvelope(clinkrOk(inlineResult)),
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

function triageSummary(items: StackDiscussionTriageItem[]): StackDiscussionTriageSummary {
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

function classificationsByPr(payload: StackFeedbackPlanInput): { type: "ok"; value: Map<number, unknown> } | { type: "error"; message: string } {
	const expectedPrs = new Set(payload.prep.stack.map((item) => item.pr_number));
	const actualPrs = payload.classifications.map((item) => item.pr_number);
	const duplicatePrs = duplicateValues(actualPrs);
	if (duplicatePrs.length > 0) return { type: "error", message: `stack-feedback-plan classifications contain duplicate PR numbers: ${pythonTupleRepr(duplicatePrs)}` };
	const actualPrSet = new Set(actualPrs);
	const missingPrs = payload.prep.stack.map((item) => item.pr_number).filter((prNumber) => !actualPrSet.has(prNumber));
	if (missingPrs.length > 0) return { type: "error", message: `stack-feedback-plan classifications missing PR numbers: ${pythonTupleRepr(missingPrs)}` };
	const unknownPrs = actualPrs.filter((prNumber) => !expectedPrs.has(prNumber));
	if (unknownPrs.length > 0) return { type: "error", message: `stack-feedback-plan classifications contain unknown PR numbers: ${pythonTupleRepr(unknownPrs)}` };
	return { type: "ok", value: new Map(payload.classifications.map((item) => [item.pr_number, item.classification])) };
}

function emptyPlanResult(options: { sessionId: string; prCount: number; validation: StackFeedbackPlanValidationSummary }): StackFeedbackPlanResult {
	return {
		valid: false,
		payload_session_id: options.sessionId,
		pr_count: options.prCount,
		validation: options.validation,
		batches: [],
		informational: [],
		automation_discussion_summary: null,
		decision_docket: [],
		stack_plan_reference: null,
		summary: null,
	};
}

function mergedStackPlanResult(options: {
	sessionId: string;
	prep: StackFeedbackPlanInput["prep"];
	validation: StackFeedbackPlanValidationSummary;
	perPrPlans: readonly FeedbackPlanningResult[];
}): StackFeedbackPlanResult {
	const batches = mergedBatches(options.prep, options.perPrPlans);
	const informational = mergedInformational(options.prep, options.perPrPlans);
	const automationSummary = automationDiscussionSummary(options.prep);
	const actionItems = batches.flatMap((batch) => batch.items);
	return {
		valid: true,
		payload_session_id: options.sessionId,
		pr_count: options.prep.stack.length,
		validation: options.validation,
		batches,
		informational,
		automation_discussion_summary: automationSummary,
		decision_docket: decisionDocket(options.prep, batches, informational),
		stack_plan_reference: null,
		summary: {
			actionable_items: actionItems.length,
			approval_required_items: actionItems.filter((item) => item.approval_required).length,
			informational_items: informational.length,
			automation_discussion_comments: automationSummary.automation_like,
		},
	};
}

function mergedBatches(prep: StackFeedbackPlanInput["prep"], perPrPlans: readonly FeedbackPlanningResult[]): StackFeedbackPlanBatch[] {
	const batches: StackFeedbackPlanBatch[] = [];
	for (const complexity of ACTION_COMPLEXITIES) {
		const items: StackFeedbackPlanItem[] = [];
		prep.stack.forEach((prResult, index) => {
			const plan = requiredAt(perPrPlans, index);
			const sourceBatch = plan.batches.find((batch) => batch.batch_id === complexity);
			if (sourceBatch !== undefined) {
				for (const item of sourceBatch.items) items.push(actionItem(prResult, sourceBatch, item));
			}
		});
		if (items.length > 0) {
			batches.push({ batch_id: complexity, complexity, approval_required: APPROVAL_REQUIRED_COMPLEXITIES.has(complexity), items });
		}
	}
	return batches;
}

function actionItem(prResult: StackPrepPrResultInput, sourceBatch: FeedbackPlanBatch, item: FeedbackPlanActionItem): StackFeedbackPlanItem {
	return {
		pr_number: prResult.pr_number,
		branch: prResult.branch,
		title: prResult.title,
		url: prResult.url,
		source_batch_id: sourceBatch.batch_id,
		source_kind: item.source_kind,
		summary: item.summary,
		action_summary: item.action_summary,
		complexity: item.complexity,
		approval_required: sourceBatch.approval_required,
		review_id: item.review_id,
		review_state: item.review_state,
		submitted_at: item.submitted_at,
		thread_id: item.thread_id,
		discussion_comment_id: item.discussion_comment_id,
		covered_comment_ids: [...item.covered_comment_ids],
		body_locator: item.body_locator,
		thread_item_pointer: item.thread_item_pointer,
		path: item.path,
		line: item.line,
		start_line: item.start_line,
		is_outdated: item.is_outdated,
		author: item.author,
		needs_reply: item.needs_reply,
	};
}

function mergedInformational(prep: StackFeedbackPlanInput["prep"], perPrPlans: readonly FeedbackPlanningResult[]): StackFeedbackPlanInformationalItem[] {
	const items: StackFeedbackPlanInformationalItem[] = [];
	prep.stack.forEach((prResult, index) => {
		const plan = requiredAt(perPrPlans, index);
		for (const item of plan.informational) items.push(informationalItem(prResult, item));
	});
	return items;
}

function informationalItem(prResult: StackPrepPrResultInput, item: FeedbackPlanInformationalItem): StackFeedbackPlanInformationalItem {
	return {
		pr_number: prResult.pr_number,
		branch: prResult.branch,
		title: prResult.title,
		url: prResult.url,
		source_kind: item.source_kind,
		summary: item.summary,
		informational_reason: requiredInformationalReason(item.informational_reason),
		user_decision_required: item.user_decision_required,
		allowed_decisions: [...item.allowed_decisions],
		review_id: item.review_id,
		review_state: item.review_state,
		submitted_at: item.submitted_at,
		thread_id: item.thread_id,
		discussion_comment_id: item.discussion_comment_id,
		covered_comment_ids: [...item.covered_comment_ids],
		body_locator: item.body_locator,
		thread_item_pointer: item.thread_item_pointer,
		path: item.path,
		line: item.line,
		start_line: item.start_line,
		is_outdated: item.is_outdated,
		author: item.author,
	};
}

function requiredInformationalReason(reason: string | null): string {
	if (reason !== null) return reason;
	throw new Error("Validated informational feedback item is missing informational_reason.");
}

function automationDiscussionSummary(prep: StackFeedbackPlanInput["prep"]): StackFeedbackAutomationDiscussionSummary {
	const items = prep.stack.flatMap((prResult) => prResult.discussion_triage.items);
	const summary = triageSummary(items);
	return {
		automation_like: summary.automation_like,
		human_like: summary.human_like,
		needs_agent_review: summary.needs_agent_review,
		by_reason: summary.by_reason,
	};
}

function decisionDocket(
	prep: StackFeedbackPlanInput["prep"],
	batches: readonly StackFeedbackPlanBatch[],
	informational: readonly StackFeedbackPlanInformationalItem[],
): StackFeedbackDecisionDocketItem[] {
	const docket: StackFeedbackDecisionDocketItem[] = [];
	for (const batch of batches) {
		for (const item of batch.items) {
			if (item.approval_required) {
				docket.push(actionDecision(item, "approval_required_action"));
			} else if (item.source_kind === "discussion_comment" && !isAutomationDiscussion(prep, item.pr_number, item.discussion_comment_id)) {
				docket.push(actionDecision(item, "discussion_comment_action"));
			}
		}
	}
	for (const item of informational) {
		if (item.user_decision_required) {
			docket.push(informationalDecision(item, "informational_review_thread"));
		} else if (item.source_kind === "discussion_comment" && !isAutomationDiscussion(prep, item.pr_number, item.discussion_comment_id)) {
			docket.push(informationalDecision(item, "discussion_comment_review"));
		}
	}
	return docket;
}

function isAutomationDiscussion(prep: StackFeedbackPlanInput["prep"], prNumber: number, discussionCommentId: number | null): boolean {
	if (discussionCommentId === null) return false;
	for (const prResult of prep.stack) {
		if (prResult.pr_number !== prNumber) continue;
		for (const item of prResult.discussion_triage.items) {
			if (item.comment_id === discussionCommentId) return item.classification_hint === "automation";
		}
	}
	return false;
}

function actionDecision(item: StackFeedbackPlanItem, decisionKind: DecisionKind): StackFeedbackDecisionDocketItem {
	return {
		decision_kind: decisionKind,
		pr_number: item.pr_number,
		branch: item.branch,
		title: item.title,
		url: item.url,
		source_kind: item.source_kind,
		thread_id: item.thread_id,
		discussion_comment_id: item.discussion_comment_id,
		path: item.path,
		line: item.line,
		summary: item.summary,
		action_summary: item.action_summary,
		recommended_decision: "act",
		approval_required: item.approval_required,
	};
}

function informationalDecision(item: StackFeedbackPlanInformationalItem, decisionKind: DecisionKind): StackFeedbackDecisionDocketItem {
	return {
		decision_kind: decisionKind,
		pr_number: item.pr_number,
		branch: item.branch,
		title: item.title,
		url: item.url,
		source_kind: item.source_kind,
		thread_id: item.thread_id,
		discussion_comment_id: item.discussion_comment_id,
		path: item.path,
		line: item.line,
		summary: item.summary,
		action_summary: null,
		recommended_decision: "dismiss",
		approval_required: false,
	};
}

function compactPlanResult(result: StackFeedbackPlanResult): unknown {
	return {
		valid: result.valid,
		payload_session_id: result.payload_session_id,
		pr_count: result.pr_count,
		validation: result.validation,
		batches: result.batches.map((batch) => ({
			batch_id: batch.batch_id,
			complexity: batch.complexity,
			approval_required: batch.approval_required,
			item_count: batch.items.length,
			items: batch.items.map((item) => ({
				pr_number: item.pr_number,
				branch: item.branch,
				source_kind: item.source_kind,
				review_id: item.review_id,
				thread_id: item.thread_id,
				discussion_comment_id: item.discussion_comment_id,
				path: item.path,
				line: item.line,
				summary: item.summary,
				action_summary: item.action_summary,
				complexity: item.complexity,
				approval_required: item.approval_required,
			})),
		})),
		informational_summary: result.valid ? compactInformationalSummary(result.informational) : null,
		automation_discussion_summary: result.automation_discussion_summary,
		decision_docket: result.decision_docket,
		stack_plan_reference: result.stack_plan_reference,
		summary: result.summary,
	};
}

function compactInformationalSummary(informational: readonly StackFeedbackPlanInformationalItem[]): unknown {
	const byReason: Record<string, number> = {};
	for (const item of informational) byReason[item.informational_reason] = (byReason[item.informational_reason] ?? 0) + 1;
	return {
		total: informational.length,
		user_decision_required: informational.filter((item) => item.user_decision_required).length,
		by_reason: byReason,
	};
}

/** Mirror Python's `validation.pr_number or pr_result.pr_number` truthiness fallback, including 0. */
function pythonOrPrNumber(validationPrNumber: number | null, fallbackPrNumber: number): number {
	if (validationPrNumber === null || validationPrNumber === 0) return fallbackPrNumber;
	return validationPrNumber;
}

function duplicateValues<T extends string | number>(values: readonly T[]): T[] {
	const counts = new Map<T, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	const seen = new Set<T>();
	const duplicates: T[] = [];
	for (const value of values) {
		if ((counts.get(value) ?? 0) > 1 && !seen.has(value)) {
			duplicates.push(value);
			seen.add(value);
		}
	}
	return duplicates;
}

/** Render values the way a Python f-string renders a tuple, for byte parity with Ensure messages. */
function pythonTupleRepr(values: ReadonlyArray<string | number>): string {
	const parts = values.map((value) => (typeof value === "number" ? String(value) : pythonStringRepr(value)));
	if (parts.length === 1) return `(${parts[0]},)`;
	return `(${parts.join(", ")})`;
}

function pythonStringRepr(value: string): string {
	return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function requiredAt<T>(values: readonly T[], index: number): T {
	const value = values[index];
	if (value === undefined) throw new Error(`Missing aligned per-PR value at index ${index}.`);
	return value;
}

function gatewayError(prefix: string, failure: GatewayFailure): { type: "error"; result: ExecOperationDispatchResult } {
	return { type: "error", result: exitFailure("pr_gateway_failure", gatewayFailureMessage(prefix, failure)) };
}

function exitFailure(errorType: string, message: string): ExecOperationDispatchResult {
	return { type: "exit", exit: clinkrFailure(errorType, message) };
}
