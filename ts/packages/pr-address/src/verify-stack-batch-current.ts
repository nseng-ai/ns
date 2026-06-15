import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { loadJsonInputFile } from "./json-input.ts";
import { isSafeSegment, type PayloadReference } from "./payload-store.ts";
import { openPayloadStoreFromContext } from "./payload-store-context.ts";
import { stackBatchArtifactDescriptor } from "./session-artifacts.ts";
import { resolveStackFeedbackDiffCurrentSessionInput } from "./session-inputs.ts";
import {
	currentThreadIndex,
	materialMetadataMismatch,
	missingOrOutdatedThreadSummary,
	newUnresolvedThreads,
	plannedThreadSummary,
	stackInputIntegrityErrors,
	type StackFeedbackCurrentnessError,
	type StackFeedbackCurrentThreadStateResult,
	type StackFeedbackPlanItem,
	type StackFeedbackPlanResult,
} from "./stack-feedback-currentness.ts";
import { stackResolveThreadDecisionSchema, type StackResolveThreadDecision } from "./stack-resolve-thread-payloads.ts";
import type { StackFeedbackThreadStateThread } from "./stack-feedback-thread-state-contracts.ts";
import { compactOperationResult } from "./stdout-mode.ts";
import { actionableReviewThreadItems, informationalReviewThreadKeys, itemsByThread, knownReviewThreadKeys, otherBatchReviewThreads, threadKey, threadKeyString } from "./stack-feedback-thread-index.ts";

const verifyStackBatchCurrentParseSchema = z.object({
	batch_id: z.string(),
	decisions_file: z.string(),
	harness_session_id: z.string().optional(),
});

interface VerifyStackBatchCurrentError {
	code: string;
	message: string;
	batch_id: string | null;
	pr_number: number | null;
	thread_id: string | null;
	actual_pr_number: number | null;
	actual_batch_id: string | null;
}

interface VerifyStackBatchCurrentResult {
	valid: boolean;
	selected_batch_current: boolean;
	safe_to_build_stack_resolve_payloads: boolean;
	batch_id: string;
	selected_still_unresolved: unknown[];
	selected_already_resolved: unknown[];
	selected_missing_or_outdated_threads: unknown[];
	unrelated_new_unresolved_threads: unknown[];
	unrelated_planned_already_resolved: unknown[];
	unrelated_missing_or_outdated_planned_threads: unknown[];
	warnings: string[];
	errors: VerifyStackBatchCurrentError[];
	summary: Record<string, number>;
	resolved_inputs?: { plan: PayloadReference; current_thread_state: PayloadReference } | undefined;
	verification_reference?: PayloadReference | null | undefined;
}

type SerializedThreadKey = string;

export const verifyStackBatchCurrentOperation = defineExecOperation({
	spec: {
		name: "verify-stack-batch-current",
		description: "Verify that a selected stack batch's review threads are still current before mutation.",
		schema: verifyStackBatchCurrentParseSchema,
		handler: runVerifyStackBatchCurrentOperation,
	},
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: ({ data, fullOutput }) => {
			const result = data as VerifyStackBatchCurrentResult;
			return {
				type: "ok",
				value: compactOperationResult({
					operation: "verify-stack-batch-current",
					counts: result.summary,
					errors: result.errors,
					warnings: result.warnings,
					resolvedInputs: result.resolved_inputs,
					artifacts: {
						full_output: fullOutput,
						produced: result.verification_reference === null || result.verification_reference === undefined ? [] : [{ kind: "stack-batch-current", reference: result.verification_reference }],
					},
					details: {
						valid: result.valid,
						selected_batch_current: result.selected_batch_current,
						safe_to_build_stack_resolve_payloads: result.safe_to_build_stack_resolve_payloads,
						batch_id: result.batch_id,
						selected_already_resolved: result.selected_already_resolved,
						selected_missing_or_outdated_threads: result.selected_missing_or_outdated_threads,
						unrelated_new_unresolved_threads: result.unrelated_new_unresolved_threads,
					},
				}),
			};
		},
	},
});

async function runVerifyStackBatchCurrentOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof verifyStackBatchCurrentParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const batchId = request.batch_id.trim();
	if (!isSafeSegment(batchId)) return failure("invalid_request", `--batch-id must be a safe payload descriptor segment: ${request.batch_id}`);

	const storeResult = await openPayloadStoreFromContext({ ctx, harnessSessionId: request.harness_session_id });
	if (storeResult.type === "error") return failure(storeResult.errorType, storeResult.message);
	const sessionInput = await resolveStackFeedbackDiffCurrentSessionInput(storeResult.value);
	if (sessionInput.type === "error") return failure(sessionInput.errorType, sessionInput.message);

	const decisions = await loadJsonInputFile({
		filePath: request.decisions_file,
		schema: stackResolveThreadDecisionSchema.array(),
		commandName: "verify-stack-batch-current",
		optionName: "--decisions-file",
	});
	if (decisions.type === "error") return failure(decisions.errorType, decisions.message);

	const result = verifyStackBatchCurrent({
		stackPlan: sessionInput.value.payload.stack_plan,
		currentThreadState: sessionInput.value.payload.current_thread_state,
		batchId,
		decisions: decisions.value,
	});
	const resultWithInputs: VerifyStackBatchCurrentResult = {
		...result,
		resolved_inputs: { plan: sessionInput.value.resolvedInputs.stack_plan, current_thread_state: sessionInput.value.resolvedInputs.current_thread_state },
		verification_reference: null,
	};
	const artifact = await storeResult.value.writeJsonArtifact({
		descriptor: stackBatchArtifactDescriptor({ batchId, kind: "current" }),
		role: "summary",
		payload: resultWithInputs,
	});
	if (artifact.type === "error") return failure(artifact.errorType, artifact.message);
	resultWithInputs.verification_reference = artifact.value;

	if (resultWithInputs.valid && resultWithInputs.selected_batch_current) return ok(resultWithInputs);
	return negative("Selected stack batch is not current or its decisions failed validation; do not build stack resolve-thread payloads for this batch.", resultWithInputs);
}

export function verifyStackBatchCurrent(input: {
	stackPlan: StackFeedbackPlanResult;
	currentThreadState: StackFeedbackCurrentThreadStateResult;
	batchId: string;
	decisions: readonly StackResolveThreadDecision[];
}): VerifyStackBatchCurrentResult {
	const stackPlan = input.stackPlan;
	const currentThreadState = input.currentThreadState;
	const batchId = input.batchId.trim();

	const selectedBatch = stackPlan.batches.find((batch) => batch.batch_id === batchId) ?? null;
	if (selectedBatch === null) {
		return invalidResult({ batchId, errors: [errorItem({ code: "unknown_stack_batch", message: `No stack plan batch found for batch_id '${batchId}'.`, batchId })] });
	}

	const plannedActionable = actionableReviewThreadItems(stackPlan);
	const plannedKnownKeys = knownReviewThreadKeys(stackPlan);
	const { currentByKey, errors: currentThreadErrors } = currentThreadIndex(currentThreadState);
	const integrityErrors = stackInputIntegrityErrors({ stackPlan, currentThreadState, plannedActionable, currentThreadErrors }).map(currentnessErrorToVerifierError(batchId));
	if (integrityErrors.length > 0) return invalidResult({ batchId, errors: integrityErrors });

	const errors: VerifyStackBatchCurrentError[] = [];
	const allThreadItems = selectedBatch.items.filter((item) => item.source_kind === "review_thread");
	for (const item of allThreadItems) {
		if (trimOptional(item.thread_id) === null) {
			errors.push(errorItem({ code: "invalid_stack_plan_thread_item", message: "Selected stack batch contains a review-thread item without a thread_id.", batchId, prNumber: item.pr_number }));
		}
	}
	const candidates = allThreadItems.filter((item) => trimOptional(item.thread_id) !== null);
	const selectedKeys = new Set(candidates.map((item) => threadKeyString(item.pr_number, trimRequired(item.thread_id))));
	const { decisionsByKey, duplicateKeys } = validateDecisionReferences({
		decisions: input.decisions,
		batchId,
		selectedKeys,
		selectedByThread: itemsByThread(candidates),
		otherBatchByKey: otherBatchReviewThreads(stackPlan, batchId),
		informationalKeys: informationalReviewThreadKeys(stackPlan),
		errors,
	});
	for (const item of candidates) {
		const threadId = trimRequired(item.thread_id);
		const key = threadKeyString(item.pr_number, threadId);
		if (!decisionsByKey.has(key)) {
			errors.push(errorItem({ code: "missing_thread_decision", message: `Missing explicit resolve or skip decision for PR #${item.pr_number} thread ${threadId}.`, batchId, prNumber: item.pr_number, threadId }));
		}
	}
	if (errors.length > 0) return invalidResult({ batchId, selectedReviewThreads: candidates.length, errors });

	const selectedStillUnresolved: unknown[] = [];
	const selectedAlreadyResolved: unknown[] = [];
	const selectedMissingOrOutdated: unknown[] = [];
	for (const item of candidates) {
		const threadId = trimRequired(item.thread_id);
		const key = threadKeyString(item.pr_number, threadId);
		if (duplicateKeys.has(key)) continue;
		const currentThread = currentByKey.get(key);
		if (currentThread === undefined) {
			selectedMissingOrOutdated.push(missingOrOutdatedThreadSummary(item, "missing_current_thread"));
			continue;
		}
		if (currentThread.is_resolved) {
			selectedAlreadyResolved.push(plannedThreadSummary(item));
			continue;
		}
		const changedFields = materialMetadataMismatch(item, currentThread);
		if (changedFields.length > 0) {
			selectedMissingOrOutdated.push(missingOrOutdatedThreadSummary(item, changedFields.includes("is_outdated") ? "outdated_changed" : "metadata_changed", changedFields));
			continue;
		}
		selectedStillUnresolved.push(plannedThreadSummary(item));
	}

	const selectedKeySet = selectedKeys;
	const unrelatedActionable = plannedActionable.filter((item) => {
		const key = threadKey(item.pr_number, item.thread_id);
		return key !== null && !selectedKeySet.has(threadKeyString(key[0], key[1]));
	});
	const unrelated = unrelatedPlannedDrift({ plannedActionable: unrelatedActionable, currentByKey });
	const unrelatedNew = newUnresolvedThreads({ currentThreadState, plannedKnownKeys });
	const warnings = unrelatedWarnings({ unrelatedNew, unrelatedAlreadyResolved: unrelated.alreadyResolved, unrelatedMissingOrOutdated: unrelated.missingOrOutdated });
	const selectedBatchCurrent = selectedAlreadyResolved.length === 0 && selectedMissingOrOutdated.length === 0;

	return {
		valid: true,
		selected_batch_current: selectedBatchCurrent,
		safe_to_build_stack_resolve_payloads: selectedBatchCurrent,
		batch_id: batchId,
		selected_still_unresolved: selectedStillUnresolved,
		selected_already_resolved: selectedAlreadyResolved,
		selected_missing_or_outdated_threads: selectedMissingOrOutdated,
		unrelated_new_unresolved_threads: unrelatedNew,
		unrelated_planned_already_resolved: unrelated.alreadyResolved,
		unrelated_missing_or_outdated_planned_threads: unrelated.missingOrOutdated,
		warnings,
		errors: [],
		summary: summary({
			selectedReviewThreads: candidates.length,
			selectedStillUnresolved: selectedStillUnresolved.length,
			selectedAlreadyResolved: selectedAlreadyResolved.length,
			selectedMissingOrOutdated: selectedMissingOrOutdated.length,
			unrelatedNew: unrelatedNew.length,
			unrelatedAlreadyResolved: unrelated.alreadyResolved.length,
			unrelatedMissingOrOutdated: unrelated.missingOrOutdated.length,
		}),
	};
}

function validateDecisionReferences(options: {
	decisions: readonly StackResolveThreadDecision[];
	batchId: string;
	selectedKeys: ReadonlySet<SerializedThreadKey>;
	selectedByThread: ReadonlyMap<string, readonly StackFeedbackPlanItem[]>;
	otherBatchByKey: ReadonlyMap<SerializedThreadKey, string>;
	informationalKeys: ReadonlySet<SerializedThreadKey>;
	errors: VerifyStackBatchCurrentError[];
}): { decisionsByKey: Map<SerializedThreadKey, StackResolveThreadDecision>; duplicateKeys: Set<SerializedThreadKey> } {
	const decisionsByKey = new Map<SerializedThreadKey, StackResolveThreadDecision>();
	const duplicateKeys = new Set<SerializedThreadKey>();
	options.decisions.forEach((decision, index) => {
		const threadId = decision.thread_id.trim();
		if (threadId === "") {
			options.errors.push(errorItem({ code: "empty_thread_decision", message: `decisions[${index}].thread_id must be non-empty.`, batchId: options.batchId, prNumber: decision.pr_number }));
			return;
		}
		const key = threadKeyString(decision.pr_number, threadId);
		if (decisionsByKey.has(key)) {
			duplicateKeys.add(key);
			options.errors.push(errorItem({ code: "duplicate_thread_decision", message: `Duplicate decision supplied for PR #${decision.pr_number} thread ${threadId}.`, batchId: options.batchId, prNumber: decision.pr_number, threadId }));
			return;
		}
		decisionsByKey.set(key, decision);
		if (options.selectedKeys.has(key)) return;
		const sameThreadItems = options.selectedByThread.get(threadId);
		if (sameThreadItems !== undefined && sameThreadItems[0] !== undefined) {
			const actualItem = sameThreadItems[0];
			options.errors.push(errorItem({ code: "thread_pr_mismatch", message: `Decision references PR #${decision.pr_number} for thread ${threadId}, but selected batch has that thread on PR #${actualItem.pr_number}.`, batchId: options.batchId, prNumber: decision.pr_number, threadId, actualPrNumber: actualItem.pr_number }));
		} else if (options.otherBatchByKey.has(key)) {
			const actualBatchId = options.otherBatchByKey.get(key) ?? "";
			options.errors.push(errorItem({ code: "thread_not_in_selected_batch", message: `Decision for PR #${decision.pr_number} thread ${threadId} belongs to batch '${actualBatchId}', not selected batch '${options.batchId}'.`, batchId: options.batchId, prNumber: decision.pr_number, threadId, actualBatchId }));
		} else if (options.informationalKeys.has(key)) {
			options.errors.push(errorItem({ code: "informational_thread_not_in_batch", message: `Decision for informational PR #${decision.pr_number} thread ${threadId} cannot be verified as a selected batch mutation item.`, batchId: options.batchId, prNumber: decision.pr_number, threadId }));
		} else {
			options.errors.push(errorItem({ code: "unknown_thread_decision", message: `Decision references unknown PR #${decision.pr_number} thread ${threadId}.`, batchId: options.batchId, prNumber: decision.pr_number, threadId }));
		}
	});
	return { decisionsByKey, duplicateKeys };
}

function unrelatedPlannedDrift(options: {
	plannedActionable: readonly StackFeedbackPlanItem[];
	currentByKey: ReadonlyMap<string, StackFeedbackThreadStateThread>;
}): { alreadyResolved: unknown[]; missingOrOutdated: unknown[] } {
	const alreadyResolved: unknown[] = [];
	const missingOrOutdated: unknown[] = [];
	for (const item of options.plannedActionable) {
		const key = threadKey(item.pr_number, item.thread_id);
		if (key === null) continue;
		const currentThread = options.currentByKey.get(threadKeyString(key[0], key[1]));
		if (currentThread === undefined) {
			missingOrOutdated.push(missingOrOutdatedThreadSummary(item, "missing_current_thread"));
			continue;
		}
		if (currentThread.is_resolved) {
			alreadyResolved.push(plannedThreadSummary(item));
			continue;
		}
		const changedFields = materialMetadataMismatch(item, currentThread);
		if (changedFields.length > 0) missingOrOutdated.push(missingOrOutdatedThreadSummary(item, changedFields.includes("is_outdated") ? "outdated_changed" : "metadata_changed", changedFields));
	}
	return { alreadyResolved, missingOrOutdated };
}

function unrelatedWarnings(options: { unrelatedNew: readonly unknown[]; unrelatedAlreadyResolved: readonly unknown[]; unrelatedMissingOrOutdated: readonly unknown[] }): string[] {
	const warnings: string[] = [];
	if (options.unrelatedNew.length > 0) warnings.push(`${options.unrelatedNew.length} unrelated new unresolved review thread(s) are present outside the selected batch.`);
	if (options.unrelatedAlreadyResolved.length > 0) warnings.push(`${options.unrelatedAlreadyResolved.length} unrelated planned review thread(s) are already resolved outside the selected batch.`);
	if (options.unrelatedMissingOrOutdated.length > 0) warnings.push(`${options.unrelatedMissingOrOutdated.length} unrelated planned review thread(s) are missing or metadata-changed outside the selected batch.`);
	return warnings;
}

function invalidResult(options: { batchId: string; errors: VerifyStackBatchCurrentError[]; selectedReviewThreads?: number | undefined }): VerifyStackBatchCurrentResult {
	return {
		valid: false,
		selected_batch_current: false,
		safe_to_build_stack_resolve_payloads: false,
		batch_id: options.batchId,
		selected_still_unresolved: [],
		selected_already_resolved: [],
		selected_missing_or_outdated_threads: [],
		unrelated_new_unresolved_threads: [],
		unrelated_planned_already_resolved: [],
		unrelated_missing_or_outdated_planned_threads: [],
		warnings: [],
		errors: options.errors,
		summary: summary({
			selectedReviewThreads: options.selectedReviewThreads ?? 0,
			selectedStillUnresolved: 0,
			selectedAlreadyResolved: 0,
			selectedMissingOrOutdated: 0,
			unrelatedNew: 0,
			unrelatedAlreadyResolved: 0,
			unrelatedMissingOrOutdated: 0,
		}),
	};
}

function summary(options: {
	selectedReviewThreads: number;
	selectedStillUnresolved: number;
	selectedAlreadyResolved: number;
	selectedMissingOrOutdated: number;
	unrelatedNew: number;
	unrelatedAlreadyResolved: number;
	unrelatedMissingOrOutdated: number;
}): Record<string, number> {
	return {
		selected_review_threads: options.selectedReviewThreads,
		selected_still_unresolved: options.selectedStillUnresolved,
		selected_already_resolved: options.selectedAlreadyResolved,
		selected_missing_or_outdated_threads: options.selectedMissingOrOutdated,
		unrelated_new_unresolved_threads: options.unrelatedNew,
		unrelated_planned_already_resolved: options.unrelatedAlreadyResolved,
		unrelated_missing_or_outdated_planned_threads: options.unrelatedMissingOrOutdated,
	};
}

function currentnessErrorToVerifierError(batchId: string): (error: StackFeedbackCurrentnessError) => VerifyStackBatchCurrentError {
	return (error) => errorItem({ code: error.code, message: error.message, batchId, prNumber: error.pr_number, threadId: error.thread_id });
}

function errorItem(options: {
	code: string;
	message: string;
	batchId?: string | null | undefined;
	prNumber?: number | null | undefined;
	threadId?: string | null | undefined;
	actualPrNumber?: number | null | undefined;
	actualBatchId?: string | null | undefined;
}): VerifyStackBatchCurrentError {
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
