import { readFile } from "node:fs/promises";

import { z } from "zod";

import { formatErrorMessage, isRecord } from "@asdl/core";
import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import {
	feedbackPlanConsumerSchema,
	type FeedbackPlanActionItem,
	type FeedbackPlanBatch,
	type FeedbackPlanConsumer as FeedbackPlan,
} from "./feedback-plan-contracts.ts";
import { parseJsonWithSchema, loadJsonInputFile } from "./json-input.ts";
import { isSafeSegment, type PayloadArtifactStore, type PayloadReference } from "./payload-store.ts";
import { prBatchArtifactDescriptor } from "./session-artifacts.ts";
import { resolveResolveThreadBuildPlanSessionInput } from "./session-inputs.ts";
import { compactOperationResult } from "./stdout-mode.ts";
import { type ThreadResolutionBuildArtifact } from "./thread-resolution-build-artifact.ts";

const VALID_RESOLUTION_MODES = ["fixed", "pre_existing", "explained", "planned"] as const;
type ResolutionReplyMode = (typeof VALID_RESOLUTION_MODES)[number];

function validResolutionModesText(): string {
	return VALID_RESOLUTION_MODES.join(", ");
}

const STACK_FEEDBACK_PLAN_NOT_SUPPORTED_CODE = "stack_feedback_plan_not_supported";
const STACK_FEEDBACK_PLAN_NOT_SUPPORTED_MESSAGE =
	"build-resolve-thread-batch-payload expects single-PR plan-feedback data, not merged stack-feedback-plan output. For stack runs, pass the stack-feedback-plan data plus explicit (pr_number, thread_id) decisions to build-stack-resolve-thread-payloads.";
const INVALID_PLAN_SHAPE_MESSAGE = "plan must be the data object returned by per-PR plan-feedback. Do not pass stack-feedback-plan output or raw feedback manifests.";

const nullableStringSchema = z.string().nullable().default(null);

const provenanceSchema = z.discriminatedUnion("kind", [
	z.looseObject({ kind: z.literal("local_branch"), branch: z.string() }),
	z.looseObject({ kind: z.literal("pr"), pr_number: z.number().int() }),
]);

export const resolveThreadBatchDecisionSchema = z.looseObject({
	thread_id: z.string(),
	action: z.string(),
	mode: nullableStringSchema,
	message: nullableStringSchema,
	commit_sha: nullableStringSchema,
	provenance: provenanceSchema.nullable().default(null),
	skip_reason: nullableStringSchema,
});

export const buildResolveThreadBatchPayloadInputSchema = z.looseObject({
	plan: z.unknown(),
	batch_id: z.string(),
	commit_sha: nullableStringSchema,
	continue_on_error: z.boolean().default(false),
	decisions: z.array(resolveThreadBatchDecisionSchema),
});

type BuildResolveThreadBatchPayloadInput = z.infer<typeof buildResolveThreadBatchPayloadInputSchema>;
export type ResolveThreadBatchDecision = z.infer<typeof resolveThreadBatchDecisionSchema>;
type ResolutionMode = ResolutionReplyMode;

interface BuildResolveThreadBatchPayloadError {
	code: string;
	message: string;
	batch_id: string | null;
	thread_id: string | null;
}

export interface ResolveThreadBatchItem {
	thread_id: string;
	mode: ResolutionMode;
	message: string | null;
	commit_sha: string | null;
	provenance: z.infer<typeof provenanceSchema> | null;
}

interface SkippedResolveThreadItem {
	thread_id: string;
	skip_reason: string;
	summary: string;
}

export interface BuildResolveThreadBatchPayloadResult {
	valid: boolean;
	payload_ready: boolean;
	batch_id: string;
	commit_sha: string | null;
	continue_on_error: boolean;
	review_thread_count: number;
	resolved_thread_count: number;
	skipped_thread_count: number;
	ignored_non_thread_items: unknown[];
	skipped_items: SkippedResolveThreadItem[];
	payload: { commit_sha: string | null; continue_on_error: boolean; items: ResolveThreadBatchItem[] } | null;
	errors: BuildResolveThreadBatchPayloadError[];
	warnings: string[];
}

export interface BuiltThreadResolutionDecision {
	errors: Array<{ code: string; message: string }>;
	payloadItem: ResolveThreadBatchItem | null;
	skipReason: string | null;
}

const buildResolveThreadBatchPayloadParseSchema = z.object({
	pr_number: z.number().int(),
	batch_id: z.string(),
	commit_sha: z.string().optional(),
	continue_on_error: z.boolean().default(false),
	decisions_file: z.string(),
	harness_session_id: z.string().optional(),
});

export const buildResolveThreadBatchPayloadOperation = defineExecOperation({
	spec: {
		name: "build-resolve-thread-batch-payload",
		description: "Build a non-mutating resolve-thread-batch payload from planned feedback decisions.",
		schema: buildResolveThreadBatchPayloadParseSchema,
		handler: runBuildResolveThreadBatchPayloadOperation,
	},
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: ({ data, fullOutput }) => compactBuildResolveThreadBatchPayloadResult(data, fullOutput),
	},
});

async function runBuildResolveThreadBatchPayloadOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof buildResolveThreadBatchPayloadParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const batchId = request.batch_id.trim();
	if (!isSafeSegment(batchId)) return failure("invalid_request", `--batch-id must be a safe payload descriptor segment: ${request.batch_id}`);
	const planInput = await resolveResolveThreadBuildPlanSessionInput({ ctx, prNumber: request.pr_number, harnessSessionId: request.harness_session_id });
	if (planInput.type === "error") return failure(planInput.errorType, planInput.message);
	const decisions = await loadJsonInputFile({
		filePath: request.decisions_file,
		schema: resolveThreadBatchDecisionSchema.array(),
		commandName: "build-resolve-thread-batch-payload",
		optionName: "--decisions-file",
	});
	if (decisions.type === "error") return failure(decisions.errorType, decisions.message);
	const result = buildResolveThreadBatchPayload({
		plan: planInput.value.plan,
		batch_id: batchId,
		commit_sha: request.commit_sha ?? null,
		continue_on_error: request.continue_on_error,
		decisions: decisions.value,
	});
	const resultWithInputs = { ...result, resolved_inputs: { plan: planInput.value.resolvedInput }, build_reference: null as PayloadReference | null };
	if (result.valid) {
		const writeResult = await planInput.value.store.writeJsonArtifact({
			descriptor: prBatchArtifactDescriptor({ prNumber: request.pr_number, batchId, kind: "resolve-build" }),
			role: "summary",
			payload: threadResolutionBuildArtifact({ source: "single_pr", prNumber: request.pr_number, result, planReference: planInput.value.resolvedInput }),
		});
		if (writeResult.type === "error") return failure(writeResult.errorType, writeResult.message);
		resultWithInputs.build_reference = writeResult.value;
	}
	if (result.valid) return ok(resultWithInputs);
	if (hasSingleErrorCode(result, STACK_FEEDBACK_PLAN_NOT_SUPPORTED_CODE)) return negative(STACK_FEEDBACK_PLAN_NOT_SUPPORTED_MESSAGE, resultWithInputs);
	return negative("Resolve-thread batch payload decisions failed validation; no payload produced.", resultWithInputs);
}

function compactBuildResolveThreadBatchPayloadResult(
	data: unknown,
	fullOutput: PayloadReference,
): { type: "ok"; value: Record<string, unknown> } {
	const result = data as BuildResolveThreadBatchPayloadResult & { resolved_inputs: unknown; build_reference: PayloadReference | null };
	return {
		type: "ok",
		value: compactOperationResult({
			operation: "build-resolve-thread-batch-payload",
			counts: {
				review_thread_count: result.review_thread_count,
				resolved_thread_count: result.resolved_thread_count,
				skipped_thread_count: result.skipped_thread_count,
				ignored_non_thread_items: result.ignored_non_thread_items.length,
			},
			errors: result.errors,
			warnings: result.warnings,
			resolvedInputs: result.resolved_inputs,
			artifacts: {
				full_output: fullOutput,
				produced: result.build_reference === null ? [] : [{ kind: "resolve-build", reference: result.build_reference }],
			},
			details: { valid: result.valid, payload_ready: result.payload_ready, batch_id: result.batch_id, build_reference: result.build_reference },
		}),
	};
}

export function threadResolutionBuildArtifact(options: {
	source: ThreadResolutionBuildArtifact["source"];
	prNumber: number;
	result: BuildResolveThreadBatchPayloadResult;
	planReference: PayloadReference;
}): ThreadResolutionBuildArtifact {
	if (!options.result.valid) throw new Error("Cannot create thread-resolution build artifact from an invalid build result.");
	return {
		artifact_kind: "thread_resolution_build",
		source: options.source,
		pr_number: options.prNumber,
		batch_id: options.result.batch_id,
		commit_sha: options.result.commit_sha,
		continue_on_error: options.result.continue_on_error,
		payload_ready: options.result.payload_ready,
		payload: options.result.payload,
		resolved_inputs: { plan: options.planReference },
		build: {
			review_thread_count: options.result.review_thread_count,
			resolved_thread_count: options.result.resolved_thread_count,
			skipped_thread_count: options.result.skipped_thread_count,
			skipped_items: options.result.skipped_items,
			ignored_non_thread_items: options.result.ignored_non_thread_items,
			warnings: options.result.warnings,
		},
	};
}

export function buildResolveThreadBatchPayload(request: BuildResolveThreadBatchPayloadInput): BuildResolveThreadBatchPayloadResult {
	const batchId = request.batch_id.trim();
	const batchCommitSha = trimOptional(request.commit_sha);

	if (looksLikeStackFeedbackPlan(request.plan)) {
		return invalidResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			errors: [errorItem({ code: STACK_FEEDBACK_PLAN_NOT_SUPPORTED_CODE, message: STACK_FEEDBACK_PLAN_NOT_SUPPORTED_MESSAGE, batchId })],
		});
	}

	const planResult = feedbackPlanConsumerSchema.safeParse(request.plan);
	if (!planResult.success) {
		return invalidResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			errors: [errorItem({ code: "invalid_plan_shape", message: INVALID_PLAN_SHAPE_MESSAGE, batchId })],
		});
	}
	const plan = planResult.data;
	if (!plan.valid) {
		return invalidResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			errors: [errorItem({ code: "invalid_plan", message: "plan.valid must be true before building a resolve-thread-batch payload.", batchId })],
		});
	}

	const selectedBatch = plan.batches.find((batch) => batch.batch_id === batchId) ?? null;
	if (selectedBatch === null) {
		return invalidResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			errors: [errorItem({ code: "unknown_batch", message: `No plan batch found for batch_id '${batchId}'.`, batchId })],
		});
	}

	const errors: BuildResolveThreadBatchPayloadError[] = [];
	const candidates: FeedbackPlanActionItem[] = [];
	const ignored = ignoredNonThreadItems(selectedBatch.items);
	for (const item of selectedBatch.items) {
		if (item.source_kind !== "review_thread") continue;
		const threadId = trimOptional(item.thread_id);
		if (threadId === null) {
			errors.push(errorItem({ code: "invalid_plan_thread_item", message: "Selected batch contains a review-thread item without a thread_id.", batchId }));
			continue;
		}
		candidates.push(item);
	}

	const selectedThreadIds = new Set(candidates.map((item) => trimRequired(item.thread_id)));
	const otherBatchByThread = otherBatchReviewThreads(plan, batchId);
	const informationalThreadIds = new Set<string>();
	for (const item of plan.informational) {
		if (item.source_kind === "review_thread") {
			const threadId = trimOptional(item.thread_id);
			if (threadId !== null) informationalThreadIds.add(threadId);
		}
	}

	const decisionsByThread = new Map<string, ResolveThreadBatchDecision>();
	const duplicateThreadIds = new Set<string>();
	request.decisions.forEach((decision, index) => {
		const threadId = decision.thread_id.trim();
		if (threadId === "") {
			errors.push(errorItem({ code: "empty_thread_decision", message: `decisions[${index}].thread_id must be non-empty.`, batchId }));
			return;
		}
		if (decisionsByThread.has(threadId)) {
			duplicateThreadIds.add(threadId);
			errors.push(errorItem({ code: "duplicate_thread_decision", message: `Duplicate decision supplied for thread ${threadId}.`, batchId, threadId }));
			return;
		}
		decisionsByThread.set(threadId, decision);
		if (selectedThreadIds.has(threadId)) return;
		const otherBatchId = otherBatchByThread.get(threadId);
		if (otherBatchId !== undefined) {
			errors.push(errorItem({ code: "thread_not_in_selected_batch", message: `Decision for thread ${threadId} belongs to batch '${otherBatchId}', not selected batch '${batchId}'.`, batchId, threadId }));
		} else if (informationalThreadIds.has(threadId)) {
			errors.push(errorItem({ code: "informational_thread_not_in_batch", message: `Decision for informational thread ${threadId} cannot be converted into a resolve-thread-batch payload item.`, batchId, threadId }));
		} else {
			errors.push(errorItem({ code: "unknown_thread_decision", message: `Decision references unknown thread ${threadId}.`, batchId, threadId }));
		}
	});

	for (const item of candidates) {
		const threadId = trimRequired(item.thread_id);
		if (!decisionsByThread.has(threadId)) errors.push(errorItem({ code: "missing_thread_decision", message: `Missing explicit resolve or skip decision for thread ${threadId}.`, batchId, threadId }));
	}

	const payloadItems: ResolveThreadBatchItem[] = [];
	const skippedItems: SkippedResolveThreadItem[] = [];
	for (const item of candidates) {
		const threadId = trimRequired(item.thread_id);
		const decision = decisionsByThread.get(threadId);
		if (duplicateThreadIds.has(threadId) || decision === undefined) continue;
		const built = buildThreadResolutionDecision({ threadId, subjectLabel: `thread ${threadId}`, batchCommitSha, decision });
		for (const issue of built.errors) errors.push(errorItem({ code: issue.code, message: issue.message, batchId, threadId }));
		if (built.errors.length > 0) continue;
		if (built.payloadItem !== null) payloadItems.push(built.payloadItem);
		if (built.skipReason !== null) skippedItems.push({ thread_id: threadId, skip_reason: built.skipReason, summary: item.summary });
	}

	const reviewThreadCount = candidates.length;
	if (errors.length > 0) return invalidResult({ batchId, commitSha: batchCommitSha, shouldContinueOnError: request.continue_on_error, reviewThreadCount, ignoredNonThreadItems: ignored, errors });
	if (candidates.length === 0) {
		return noPayloadResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			reviewThreadCount: 0,
			ignoredNonThreadItems: ignored,
			skippedItems: [],
			warning: "Selected batch has no review-thread items; do not call resolve-thread-batch for this batch.",
		});
	}
	if (payloadItems.length === 0) {
		return noPayloadResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			reviewThreadCount,
			ignoredNonThreadItems: ignored,
			skippedItems,
			warning: "All selected review-thread items were explicitly skipped; do not call resolve-thread-batch for this batch.",
		});
	}
	const duplicatePayloadThreadId = firstDuplicatePayloadThreadId(payloadItems);
	if (duplicatePayloadThreadId !== null) {
		return invalidResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			reviewThreadCount,
			ignoredNonThreadItems: ignored,
			errors: [errorItem({ code: "canonical_payload_invalid", message: `Duplicate thread_id in resolve-thread-batch payload: ${duplicatePayloadThreadId}`, batchId, threadId: duplicatePayloadThreadId })],
		});
	}
	return {
		valid: true,
		payload_ready: true,
		batch_id: batchId,
		commit_sha: batchCommitSha,
		continue_on_error: request.continue_on_error,
		review_thread_count: reviewThreadCount,
		resolved_thread_count: payloadItems.length,
		skipped_thread_count: skippedItems.length,
		ignored_non_thread_items: ignored,
		skipped_items: skippedItems,
		payload: { commit_sha: batchCommitSha, continue_on_error: request.continue_on_error, items: payloadItems },
		errors: [],
		warnings: [],
	};
}

export function buildThreadResolutionDecision(options: {
	threadId: string;
	subjectLabel: string;
	batchCommitSha: string | null;
	decision: ResolveThreadBatchDecision;
}): BuiltThreadResolutionDecision {
	const action = options.decision.action.trim();
	const mode = trimOptional(options.decision.mode);
	const message = trimOptional(options.decision.message);
	const itemCommitSha = trimOptional(options.decision.commit_sha);
	const skipReason = trimOptional(options.decision.skip_reason);
	const provenance = options.decision.provenance;
	if (action === "skip") return buildSkipDecision({ subjectLabel: options.subjectLabel, mode, message, itemCommitSha, provenance, skipReason });
	if (action !== "resolve") {
		return { errors: [{ code: "invalid_action", message: `Decision for ${options.subjectLabel} must use action='resolve' or action='skip'.` }], payloadItem: null, skipReason: null };
	}
	if (!isResolutionMode(mode)) {
		return {
			errors: [{ code: "invalid_mode", message: `Resolve decision for ${options.subjectLabel} must use one of: ${validResolutionModesText()}.` }],
			payloadItem: null,
			skipReason: null,
		};
	}
	const resolutionMode = mode;
	const errors = resolveDecisionIssues({ subjectLabel: options.subjectLabel, batchCommitSha: options.batchCommitSha, mode: resolutionMode, message, itemCommitSha, provenance });
	if (errors.length > 0) return { errors, payloadItem: null, skipReason: null };
	if (resolutionMode === "pre_existing") {
		return { errors: [], payloadItem: { thread_id: options.threadId, mode: resolutionMode, message: null, commit_sha: null, provenance: null }, skipReason: null };
	}
	return {
		errors: [],
		payloadItem: {
			thread_id: options.threadId,
			mode: resolutionMode,
			message,
			commit_sha: itemCommitSha,
			provenance: resolutionMode === "planned" ? provenance : null,
		},
		skipReason: null,
	};
}

function buildSkipDecision(options: {
	subjectLabel: string;
	mode: string | null;
	message: string | null;
	itemCommitSha: string | null;
	provenance: unknown | null;
	skipReason: string | null;
}): BuiltThreadResolutionDecision {
	const errors: Array<{ code: string; message: string }> = [];
	if (options.skipReason === null) errors.push({ code: "missing_skip_reason", message: `Skip decision for ${options.subjectLabel} requires a non-empty skip_reason.` });
	if (options.mode !== null || options.message !== null || options.itemCommitSha !== null || options.provenance !== null) {
		errors.push({ code: "skip_decision_has_resolution_fields", message: `Skip decision for ${options.subjectLabel} must not include non-empty mode, message, commit_sha, or provenance fields.` });
	}
	if (errors.length > 0) return { errors, payloadItem: null, skipReason: null };
	return { errors: [], payloadItem: null, skipReason: trimRequired(options.skipReason) };
}

function resolveDecisionIssues(options: {
	subjectLabel: string;
	batchCommitSha: string | null;
	mode: ResolutionMode;
	message: string | null;
	itemCommitSha: string | null;
	provenance: z.infer<typeof provenanceSchema> | null;
}): Array<{ code: string; message: string }> {
	const errors: Array<{ code: string; message: string }> = [];
	if ((options.mode === "fixed" || options.mode === "explained" || options.mode === "planned") && options.message === null) {
		errors.push({ code: "missing_message", message: `mode='${options.mode}' decision for ${options.subjectLabel} requires a non-empty message.` });
	}
	if (options.mode === "fixed" && options.itemCommitSha === null && options.batchCommitSha === null) {
		errors.push({ code: "missing_commit_sha", message: `Decision for ${options.subjectLabel} uses mode='fixed' but no batch or item commit_sha was supplied.` });
	}
	if (options.mode !== "planned" && options.provenance !== null) {
		errors.push({ code: "non_planned_has_provenance", message: `mode='${options.mode}' decision for ${options.subjectLabel} must not include provenance; provenance is only valid with mode='planned'.` });
	}
	if (options.mode === "planned") errors.push(...plannedDecisionIssues(options.subjectLabel, options.itemCommitSha, options.provenance));
	if (options.mode === "pre_existing" && (options.message !== null || options.itemCommitSha !== null)) {
		errors.push({ code: "pre_existing_has_resolution_fields", message: `mode='pre_existing' decision for ${options.subjectLabel} must not include non-empty message, commit_sha, or provenance fields.` });
	}
	return errors;
}

function plannedDecisionIssues(subjectLabel: string, itemCommitSha: string | null, provenance: z.infer<typeof provenanceSchema> | null): Array<{ code: string; message: string }> {
	const errors: Array<{ code: string; message: string }> = [];
	if (provenance === null) errors.push({ code: "missing_provenance", message: `mode='planned' decision for ${subjectLabel} requires provenance.` });
	if (itemCommitSha !== null) errors.push({ code: "planned_has_commit_sha", message: `mode='planned' decision for ${subjectLabel} must not include item commit_sha.` });
	if (provenance !== null) {
		const shapeError = provenanceShapeError(provenance);
		if (shapeError !== null) errors.push({ code: "invalid_provenance_shape", message: `mode='planned' decision for ${subjectLabel}: ${shapeError}.` });
	}
	return errors;
}


function ignoredNonThreadItems(items: readonly FeedbackPlanActionItem[]): unknown[] {
	const ignored: unknown[] = [];
	for (const item of items) {
		if (item.source_kind === "review_thread") continue;
		ignored.push({ source_kind: item.source_kind, review_id: item.review_id, discussion_comment_id: item.discussion_comment_id, summary: item.summary });
	}
	return ignored;
}

function otherBatchReviewThreads(plan: FeedbackPlan, selectedBatchId: string): Map<string, string> {
	const lookup = new Map<string, string>();
	for (const batch of plan.batches) {
		if (batch.batch_id === selectedBatchId) continue;
		for (const item of batch.items) {
			if (item.source_kind !== "review_thread") continue;
			const threadId = trimOptional(item.thread_id);
			if (threadId !== null) lookup.set(threadId, batch.batch_id);
		}
	}
	return lookup;
}

function invalidResult(options: {
	batchId: string;
	commitSha: string | null;
	shouldContinueOnError: boolean;
	errors: BuildResolveThreadBatchPayloadError[];
	reviewThreadCount?: number | undefined;
	ignoredNonThreadItems?: unknown[] | undefined;
}): BuildResolveThreadBatchPayloadResult {
	return {
		valid: false,
		payload_ready: false,
		batch_id: options.batchId,
		commit_sha: options.commitSha,
		continue_on_error: options.shouldContinueOnError,
		review_thread_count: options.reviewThreadCount ?? 0,
		resolved_thread_count: 0,
		skipped_thread_count: 0,
		ignored_non_thread_items: options.ignoredNonThreadItems ?? [],
		skipped_items: [],
		payload: null,
		errors: options.errors,
		warnings: [],
	};
}

function noPayloadResult(options: {
	batchId: string;
	commitSha: string | null;
	shouldContinueOnError: boolean;
	reviewThreadCount: number;
	ignoredNonThreadItems: unknown[];
	skippedItems: SkippedResolveThreadItem[];
	warning: string;
}): BuildResolveThreadBatchPayloadResult {
	return {
		valid: true,
		payload_ready: false,
		batch_id: options.batchId,
		commit_sha: options.commitSha,
		continue_on_error: options.shouldContinueOnError,
		review_thread_count: options.reviewThreadCount,
		resolved_thread_count: 0,
		skipped_thread_count: options.skippedItems.length,
		ignored_non_thread_items: options.ignoredNonThreadItems,
		skipped_items: options.skippedItems,
		payload: null,
		errors: [],
		warnings: [options.warning],
	};
}

function errorItem(options: { code: string; message: string; batchId?: string | null | undefined; threadId?: string | null | undefined }): BuildResolveThreadBatchPayloadError {
	return { code: options.code, message: options.message, batch_id: options.batchId ?? null, thread_id: options.threadId ?? null };
}

function hasSingleErrorCode(result: BuildResolveThreadBatchPayloadResult, errorCode: string): boolean {
	return result.errors.length === 1 && result.errors[0]?.code === errorCode;
}

function looksLikeStackFeedbackPlan(value: unknown): boolean {
	if (!isRecord(value)) return false;
	const validation = value.validation;
	return "valid" in value && "harness_session_id" in value && "pr_count" in value && isRecord(validation) && ("all_valid" in validation || "per_pr" in validation);
}

export function firstDuplicatePayloadThreadId(items: readonly ResolveThreadBatchItem[]): string | null {
	const seen = new Set<string>();
	for (const item of items) {
		if (seen.has(item.thread_id)) return item.thread_id;
		seen.add(item.thread_id);
	}
	return null;
}

function isResolutionMode(value: string | null): value is ResolutionMode {
	return value !== null && VALID_RESOLUTION_MODES.some((mode) => mode === value);
}


function trimOptional(value: string | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function trimRequired(value: string | null | undefined): string {
	const trimmed = trimOptional(value);
	if (trimmed === null) throw new Error("Expected non-empty string.");
	return trimmed;
}

function provenanceShapeError(provenance: { kind: string; branch?: string; pr_number?: number }): string | null {
	if (provenance.kind === "local_branch") return trimOptional(provenance.branch) === null ? "kind='local_branch' provenance requires a non-empty branch" : null;
	if (provenance.kind === "pr" && (provenance.pr_number === undefined || provenance.pr_number <= 0)) {
		return "kind='pr' provenance requires a positive pr_number";
	}
	return null;
}
