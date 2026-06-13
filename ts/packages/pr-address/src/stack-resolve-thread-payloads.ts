import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { loadOperationPayload, type OperationPayloadField } from "./json-input.ts";
import { buildThreadResolutionDecision, resolveThreadBatchDecisionSchema, type ResolveThreadBatchItem } from "./resolve-thread-batch-payload.ts";
import { informationalReviewThreadKeys, itemsByThread, otherBatchReviewThreads, threadKeyString } from "./stack-feedback-thread-index.ts";
import { trimOptional, trimRequired } from "./string-values.ts";

const INVALID_STACK_PLAN_SHAPE_MESSAGE = "stack_plan must be the data object returned by stack-feedback-plan.";

const nullableStringSchema = z.string().nullable().default(null);

const stackResolveThreadDecisionSchema = resolveThreadBatchDecisionSchema.extend({
	pr_number: z.number().int(),
});

const buildStackResolveThreadPayloadsInputSchema = z.looseObject({
	stack_plan: z.unknown(),
	batch_id: z.string(),
	commit_sha: nullableStringSchema,
	continue_on_error: z.boolean().default(false),
	decisions: z.array(stackResolveThreadDecisionSchema),
});

/** Wire payload: `stack_plan` may be omitted when `--stack-plan-reference` supplies it. */
const buildStackResolveThreadPayloadsWirePayloadSchema = buildStackResolveThreadPayloadsInputSchema.extend({
	stack_plan: z.unknown().optional(),
});
type BuildStackResolveThreadPayloadsWirePayload = z.infer<typeof buildStackResolveThreadPayloadsWirePayloadSchema>;
const buildStackResolveThreadPayloadsFields = [
	{
		key: "stack_plan",
		artifactDescription: "a stack-feedback-plan data artifact",
		referenceSchema: z.unknown(),
		inputName: "stack plan",
	},
] as const satisfies readonly OperationPayloadField<BuildStackResolveThreadPayloadsWirePayload, keyof BuildStackResolveThreadPayloadsWirePayload & string>[];

const stackPlanItemSchema = z.looseObject({
	pr_number: z.number().int(),
	branch: z.string(),
	title: nullableStringSchema,
	url: nullableStringSchema,
	source_batch_id: nullableStringSchema,
	source_kind: z.string(),
	summary: z.string(),
	review_id: nullableStringSchema,
	thread_id: nullableStringSchema,
	discussion_comment_id: z.number().int().nullable().default(null),
});

const stackPlanBatchSchema = z.looseObject({
	batch_id: z.string(),
	complexity: z.string(),
	approval_required: z.boolean(),
	items: z.array(stackPlanItemSchema),
});

const stackPlanConsumerSchema = z.looseObject({
	valid: z.boolean(),
	payload_session_id: z.string(),
	pr_count: z.number().int(),
	validation: z.looseObject({ all_valid: z.boolean(), per_pr: z.array(z.unknown()).default([]) }),
	batches: z.array(stackPlanBatchSchema).default([]),
	informational: z.array(stackPlanItemSchema).default([]),
});

type StackResolveThreadDecision = z.infer<typeof stackResolveThreadDecisionSchema>;
type StackPlanItem = z.infer<typeof stackPlanItemSchema>;
/** Serialized `(pr_number, thread_id)` identity used for Map/Set keys. */
type ThreadKey = string;

interface BuildStackResolveThreadPayloadsError {
	code: string;
	message: string;
	batch_id: string | null;
	pr_number: number | null;
	thread_id: string | null;
	actual_pr_number: number | null;
	actual_batch_id: string | null;
}

interface StackIgnoredNonThreadItem {
	pr_number: number;
	branch: string;
	source_kind: string;
	review_id: string | null;
	discussion_comment_id: number | null;
	summary: string;
}

interface StackSkippedResolveThreadItem {
	pr_number: number;
	branch: string;
	thread_id: string;
	skip_reason: string;
	summary: string;
}

interface StackResolveThreadPayloadEntry {
	pr_number: number;
	branch: string;
	title: string | null;
	url: string | null;
	batch_id: string;
	source_batch_id: string | null;
	payload_ready: boolean;
	review_thread_count: number;
	resolved_thread_count: number;
	skipped_thread_count: number;
	ignored_non_thread_items: StackIgnoredNonThreadItem[];
	skipped_items: StackSkippedResolveThreadItem[];
	payload: { commit_sha: string | null; continue_on_error: boolean; items: ResolveThreadBatchItem[] } | null;
	warnings: string[];
}

interface BuildStackResolveThreadPayloadsResult {
	valid: boolean;
	payloads_ready: boolean;
	batch_id: string;
	commit_sha: string | null;
	continue_on_error: boolean;
	review_thread_count: number;
	resolved_thread_count: number;
	skipped_thread_count: number;
	ignored_non_thread_items: StackIgnoredNonThreadItem[];
	skipped_items: StackSkippedResolveThreadItem[];
	payloads: StackResolveThreadPayloadEntry[];
	errors: BuildStackResolveThreadPayloadsError[];
	warnings: string[];
}

const buildStackResolveThreadPayloadsParseSchema = z.object({
	payload_json: z.string().optional(),
	payload_file: z.string().optional(),
	stack_plan_reference: z.string().optional(),
});

export const buildStackResolveThreadPayloadsOperation = defineExecOperation({
	spec: {
		name: "build-stack-resolve-thread-payloads",
		description: "Build non-mutating per-PR resolve-thread-batch payloads from stack decisions.",
		schema: buildStackResolveThreadPayloadsParseSchema,
		handler: runBuildStackResolveThreadPayloadsOperation,
	},
});

async function runBuildStackResolveThreadPayloadsOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof buildStackResolveThreadPayloadsParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const payloadResult = await loadOperationPayload({
		commandName: "build-stack-resolve-thread-payloads",
		inputDescription: "JSON payload",
		payloadSchema: buildStackResolveThreadPayloadsWirePayloadSchema,
		request,
		stdin: ctx.stdin,
		fields: buildStackResolveThreadPayloadsFields,
	});
	if (payloadResult.type === "error") return failure(payloadResult.error.errorType, payloadResult.error.message);

	const result = buildStackResolveThreadPayloads(payloadResult.value);
	if (result.valid) return ok(result);
	return negative("Stack resolve-thread payload decisions failed validation; no payloads produced.", result);
}

export function buildStackResolveThreadPayloads(input: unknown): BuildStackResolveThreadPayloadsResult {
	const request = buildStackResolveThreadPayloadsInputSchema.parse(input);
	const batchId = request.batch_id.trim();
	const batchCommitSha = trimOptional(request.commit_sha);

	const stackPlanResult = stackPlanConsumerSchema.safeParse(request.stack_plan);
	if (!stackPlanResult.success) {
		return invalidResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			errors: [errorItem({ code: "invalid_stack_plan_shape", message: INVALID_STACK_PLAN_SHAPE_MESSAGE, batchId })],
		});
	}
	const stackPlan = stackPlanResult.data;
	if (!stackPlan.valid) {
		return invalidResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			errors: [errorItem({ code: "invalid_stack_plan", message: "stack_plan.valid must be true before building stack resolve-thread payloads.", batchId })],
		});
	}

	const selectedBatch = stackPlan.batches.find((batch) => batch.batch_id === batchId) ?? null;
	if (selectedBatch === null) {
		return invalidResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			errors: [errorItem({ code: "unknown_stack_batch", message: `No stack plan batch found for batch_id '${batchId}'.`, batchId })],
		});
	}

	const errors: BuildStackResolveThreadPayloadsError[] = [];
	const allThreadItems = selectedBatch.items.filter((item) => item.source_kind === "review_thread");
	const ignored = ignoredNonThreadItems(selectedBatch.items);
	for (const item of allThreadItems) {
		if (trimOptional(item.thread_id) === null) {
			errors.push(
				errorItem({
					code: "invalid_stack_plan_thread_item",
					message: "Selected stack batch contains a review-thread item without a thread_id.",
					batchId,
					prNumber: item.pr_number,
				}),
			);
		}
	}

	const candidates = allThreadItems.filter((item) => trimOptional(item.thread_id) !== null);
	const selectedKeys = new Set(candidates.map((item) => threadKeyString(item.pr_number, trimRequired(item.thread_id))));
	const selectedByThread = itemsByThread(candidates);
	const otherBatchByKey = otherBatchReviewThreads(stackPlan, batchId);
	const informationalKeys = informationalReviewThreadKeys(stackPlan);

	const { decisionsByKey, duplicateKeys } = validateDecisionReferences({
		decisions: request.decisions,
		batchId,
		selectedKeys,
		selectedByThread,
		otherBatchByKey,
		informationalKeys,
		errors,
	});

	for (const item of candidates) {
		const key = threadKeyString(item.pr_number, trimRequired(item.thread_id));
		if (!decisionsByKey.has(key)) {
			errors.push(
				errorItem({
					code: "missing_thread_decision",
					message: `Missing explicit resolve or skip decision for PR #${item.pr_number} thread ${trimRequired(item.thread_id)}.`,
					batchId,
					prNumber: item.pr_number,
					threadId: trimRequired(item.thread_id),
				}),
			);
		}
	}

	const payloadItemsByPr = new Map<number, ResolveThreadBatchItem[]>();
	const skippedByPr = new Map<number, StackSkippedResolveThreadItem[]>();
	for (const item of candidates) {
		const threadId = trimRequired(item.thread_id);
		const key = threadKeyString(item.pr_number, threadId);
		const decision = decisionsByKey.get(key);
		if (duplicateKeys.has(key) || decision === undefined) continue;
		const built = buildThreadResolutionDecision({
			threadId,
			subjectLabel: `PR #${item.pr_number} thread ${threadId}`,
			batchCommitSha,
			decision,
		});
		for (const issue of built.errors) {
			errors.push(errorItem({ code: issue.code, message: issue.message, batchId, prNumber: item.pr_number, threadId }));
		}
		if (built.errors.length > 0) continue;
		if (built.payloadItem !== null) appendForPr(payloadItemsByPr, item.pr_number, built.payloadItem);
		if (built.skipReason !== null) {
			appendForPr(skippedByPr, item.pr_number, {
				pr_number: item.pr_number,
				branch: item.branch,
				thread_id: threadId,
				skip_reason: built.skipReason,
				summary: item.summary,
			});
		}
	}

	const reviewThreadCount = candidates.length;
	if (errors.length > 0) {
		return invalidResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			reviewThreadCount,
			ignoredNonThreadItems: ignored,
			errors,
		});
	}

	if (candidates.length === 0) {
		return noPayloadResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			reviewThreadCount: 0,
			ignoredNonThreadItems: ignored,
			skippedItems: [],
			warning: "Selected stack batch has no review-thread items; do not call resolve-thread-batch for this batch.",
		});
	}

	const { entries, errors: payloadErrors } = payloadEntries({
		batchId,
		commitSha: batchCommitSha,
		shouldContinueOnError: request.continue_on_error,
		candidates,
		ignored,
		payloadItemsByPr,
		skippedByPr,
	});
	if (payloadErrors.length > 0) {
		return invalidResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			reviewThreadCount,
			ignoredNonThreadItems: ignored,
			errors: payloadErrors,
		});
	}

	const skippedItems = [...skippedByPr.values()].flat();
	if (!entries.some((entry) => entry.payload_ready)) {
		return noPayloadResult({
			batchId,
			commitSha: batchCommitSha,
			shouldContinueOnError: request.continue_on_error,
			reviewThreadCount,
			ignoredNonThreadItems: ignored,
			skippedItems,
			payloads: entries,
			warning: "All selected stack review-thread items were explicitly skipped; do not call resolve-thread-batch for this batch.",
		});
	}

	return {
		valid: true,
		payloads_ready: true,
		batch_id: batchId,
		commit_sha: batchCommitSha,
		continue_on_error: request.continue_on_error,
		review_thread_count: reviewThreadCount,
		resolved_thread_count: entries.reduce((total, entry) => total + entry.resolved_thread_count, 0),
		skipped_thread_count: entries.reduce((total, entry) => total + entry.skipped_thread_count, 0),
		ignored_non_thread_items: ignored,
		skipped_items: skippedItems,
		payloads: entries,
		errors: [],
		warnings: [],
	};
}

function validateDecisionReferences(options: {
	decisions: readonly StackResolveThreadDecision[];
	batchId: string;
	selectedKeys: ReadonlySet<ThreadKey>;
	selectedByThread: ReadonlyMap<string, readonly StackPlanItem[]>;
	otherBatchByKey: ReadonlyMap<ThreadKey, string>;
	informationalKeys: ReadonlySet<ThreadKey>;
	errors: BuildStackResolveThreadPayloadsError[];
}): { decisionsByKey: Map<ThreadKey, StackResolveThreadDecision>; duplicateKeys: Set<ThreadKey> } {
	const decisionsByKey = new Map<ThreadKey, StackResolveThreadDecision>();
	const duplicateKeys = new Set<ThreadKey>();
	options.decisions.forEach((decision, index) => {
		const threadId = decision.thread_id.trim();
		if (threadId === "") {
			options.errors.push(
				errorItem({
					code: "empty_thread_decision",
					message: `decisions[${index}].thread_id must be non-empty.`,
					batchId: options.batchId,
					prNumber: decision.pr_number,
				}),
			);
			return;
		}
		const key = threadKeyString(decision.pr_number, threadId);
		if (decisionsByKey.has(key)) {
			duplicateKeys.add(key);
			options.errors.push(
				errorItem({
					code: "duplicate_thread_decision",
					message: `Duplicate decision supplied for PR #${decision.pr_number} thread ${threadId}.`,
					batchId: options.batchId,
					prNumber: decision.pr_number,
					threadId,
				}),
			);
			return;
		}
		decisionsByKey.set(key, decision);

		if (options.selectedKeys.has(key)) return;
		const sameThreadItems = options.selectedByThread.get(threadId);
		if (sameThreadItems !== undefined && sameThreadItems[0] !== undefined) {
			const actualItem = sameThreadItems[0];
			options.errors.push(
				errorItem({
					code: "thread_pr_mismatch",
					message: `Decision references PR #${decision.pr_number} for thread ${threadId}, but selected batch has that thread on PR #${actualItem.pr_number}.`,
					batchId: options.batchId,
					prNumber: decision.pr_number,
					threadId,
					actualPrNumber: actualItem.pr_number,
				}),
			);
		} else if (options.otherBatchByKey.has(key)) {
			const actualBatchId = options.otherBatchByKey.get(key) ?? "";
			options.errors.push(
				errorItem({
					code: "thread_not_in_selected_batch",
					message: `Decision for PR #${decision.pr_number} thread ${threadId} belongs to batch '${actualBatchId}', not selected batch '${options.batchId}'.`,
					batchId: options.batchId,
					prNumber: decision.pr_number,
					threadId,
					actualBatchId,
				}),
			);
		} else if (options.informationalKeys.has(key)) {
			options.errors.push(
				errorItem({
					code: "informational_thread_not_in_batch",
					message: `Decision for informational PR #${decision.pr_number} thread ${threadId} cannot be converted into a resolve-thread-batch payload item.`,
					batchId: options.batchId,
					prNumber: decision.pr_number,
					threadId,
				}),
			);
		} else {
			options.errors.push(
				errorItem({
					code: "unknown_thread_decision",
					message: `Decision references unknown PR #${decision.pr_number} thread ${threadId}.`,
					batchId: options.batchId,
					prNumber: decision.pr_number,
					threadId,
				}),
			);
		}
	});
	return { decisionsByKey, duplicateKeys };
}

function payloadEntries(options: {
	batchId: string;
	commitSha: string | null;
	shouldContinueOnError: boolean;
	candidates: readonly StackPlanItem[];
	ignored: readonly StackIgnoredNonThreadItem[];
	payloadItemsByPr: ReadonlyMap<number, ResolveThreadBatchItem[]>;
	skippedByPr: ReadonlyMap<number, StackSkippedResolveThreadItem[]>;
}): { entries: StackResolveThreadPayloadEntry[]; errors: BuildStackResolveThreadPayloadsError[] } {
	const entries: StackResolveThreadPayloadEntry[] = [];
	const errors: BuildStackResolveThreadPayloadsError[] = [];
	for (const [prNumber, prCandidates] of candidatesByPr(options.candidates)) {
		const representative = prCandidates[0];
		if (representative === undefined) continue;
		const payloadItems = options.payloadItemsByPr.get(prNumber) ?? [];
		const payloadReady = payloadItems.length > 0;
		let payload: StackResolveThreadPayloadEntry["payload"] = null;
		if (payloadReady) {
			payload = { commit_sha: options.commitSha, continue_on_error: options.shouldContinueOnError, items: payloadItems };
			const duplicateThreadId = firstDuplicatePayloadThreadId(payloadItems);
			if (duplicateThreadId !== null) {
				errors.push(
					errorItem({
						code: "canonical_payload_invalid",
						message: `Duplicate thread_id in PR #${prNumber} resolve-thread-batch payload: ${duplicateThreadId}`,
						batchId: options.batchId,
						prNumber,
						threadId: duplicateThreadId,
					}),
				);
			}
		}
		const skippedItems = options.skippedByPr.get(prNumber) ?? [];
		entries.push({
			pr_number: prNumber,
			branch: representative.branch,
			title: representative.title,
			url: representative.url,
			batch_id: options.batchId,
			source_batch_id: representative.source_batch_id,
			payload_ready: payloadReady,
			review_thread_count: prCandidates.length,
			resolved_thread_count: payloadItems.length,
			skipped_thread_count: skippedItems.length,
			ignored_non_thread_items: options.ignored.filter((item) => item.pr_number === prNumber),
			skipped_items: skippedItems,
			payload,
			warnings: payloadReady ? [] : ["No resolve-thread-batch payload is needed for this PR."],
		});
	}
	return { entries, errors };
}

function candidatesByPr(candidates: readonly StackPlanItem[]): Map<number, StackPlanItem[]> {
	const grouped = new Map<number, StackPlanItem[]>();
	for (const item of candidates) appendForPr(grouped, item.pr_number, item);
	return grouped;
}

function ignoredNonThreadItems(items: readonly StackPlanItem[]): StackIgnoredNonThreadItem[] {
	const ignored: StackIgnoredNonThreadItem[] = [];
	for (const item of items) {
		if (item.source_kind === "review_thread") continue;
		ignored.push({
			pr_number: item.pr_number,
			branch: item.branch,
			source_kind: item.source_kind,
			review_id: item.review_id,
			discussion_comment_id: item.discussion_comment_id,
			summary: item.summary,
		});
	}
	return ignored;
}

function firstDuplicatePayloadThreadId(items: readonly ResolveThreadBatchItem[]): string | null {
	const seen = new Set<string>();
	for (const item of items) {
		if (seen.has(item.thread_id)) return item.thread_id;
		seen.add(item.thread_id);
	}
	return null;
}

function invalidResult(options: {
	batchId: string;
	commitSha: string | null;
	shouldContinueOnError: boolean;
	errors: BuildStackResolveThreadPayloadsError[];
	reviewThreadCount?: number | undefined;
	ignoredNonThreadItems?: StackIgnoredNonThreadItem[] | undefined;
}): BuildStackResolveThreadPayloadsResult {
	return {
		valid: false,
		payloads_ready: false,
		batch_id: options.batchId,
		commit_sha: options.commitSha,
		continue_on_error: options.shouldContinueOnError,
		review_thread_count: options.reviewThreadCount ?? 0,
		resolved_thread_count: 0,
		skipped_thread_count: 0,
		ignored_non_thread_items: options.ignoredNonThreadItems ?? [],
		skipped_items: [],
		payloads: [],
		errors: options.errors,
		warnings: [],
	};
}

function noPayloadResult(options: {
	batchId: string;
	commitSha: string | null;
	shouldContinueOnError: boolean;
	reviewThreadCount: number;
	ignoredNonThreadItems: StackIgnoredNonThreadItem[];
	skippedItems: StackSkippedResolveThreadItem[];
	warning: string;
	payloads?: StackResolveThreadPayloadEntry[] | undefined;
}): BuildStackResolveThreadPayloadsResult {
	return {
		valid: true,
		payloads_ready: false,
		batch_id: options.batchId,
		commit_sha: options.commitSha,
		continue_on_error: options.shouldContinueOnError,
		review_thread_count: options.reviewThreadCount,
		resolved_thread_count: 0,
		skipped_thread_count: options.skippedItems.length,
		ignored_non_thread_items: options.ignoredNonThreadItems,
		skipped_items: options.skippedItems,
		payloads: options.payloads ?? [],
		errors: [],
		warnings: [options.warning],
	};
}

function errorItem(options: {
	code: string;
	message: string;
	batchId?: string | null | undefined;
	prNumber?: number | null | undefined;
	threadId?: string | null | undefined;
	actualPrNumber?: number | null | undefined;
	actualBatchId?: string | null | undefined;
}): BuildStackResolveThreadPayloadsError {
	return {
		code: options.code,
		message: options.message,
		batch_id: options.batchId ?? null,
		pr_number: options.prNumber ?? null,
		thread_id: options.threadId ?? null,
		actual_pr_number: options.actualPrNumber ?? null,
		actual_batch_id: options.actualBatchId ?? null,
	};
}

function appendForPr<T>(grouped: Map<number, T[]>, prNumber: number, value: T): void {
	const existing = grouped.get(prNumber);
	if (existing === undefined) grouped.set(prNumber, [value]);
	else existing.push(value);
}
