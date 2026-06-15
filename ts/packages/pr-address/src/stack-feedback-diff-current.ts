import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { duplicateValues } from "./duplicate-values.ts";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { openPayloadStoreFromContext } from "./payload-store-context.ts";
import {
	rejectNonEmptyStdin,
	resolveStackFeedbackDiffCurrentSessionInput,
	type OperationResult,
	type StackFeedbackDiffCurrentResolvedInputs,
} from "./session-inputs.ts";
import type { PayloadReference } from "./payload-store.ts";
import { stackFeedbackPlanConsumerResultSchema, type StackFeedbackPlanConsumerItem, type StackFeedbackPlanConsumerResult } from "./stack-feedback-plan-contracts.ts";
import { compactOperationResult } from "./stdout-mode.ts";
import {
	stackFeedbackThreadStateResultSchema,
	type StackFeedbackThreadStateResult,
	type StackFeedbackThreadStateThread,
} from "./stack-feedback-thread-state-contracts.ts";
import { actionableReviewThreadItems, duplicateThreadKeys, knownReviewThreadKeys, plannedPrNumbers, threadKey, threadKeyString, type ThreadKey } from "./stack-feedback-thread-index.ts";

const INVALID_STACK_PLAN_SHAPE_MESSAGE = "stack_plan must be the data object returned by stack-feedback-plan.";
const INVALID_CURRENT_THREAD_STATE_SHAPE_MESSAGE = "current_thread_state must be the data object returned by stack-feedback-thread-state.";
type StackFeedbackPlanItem = StackFeedbackPlanConsumerItem;
type StackFeedbackPlanResult = StackFeedbackPlanConsumerResult;
type StackFeedbackCurrentThreadStateResult = StackFeedbackThreadStateResult;

interface DiffCurrentError {
	code: string;
	message: string;
	pr_number: number | null;
	thread_id: string | null;
}

interface DiffCurrentResult {
	valid: boolean;
	safe_to_resolve_planned: boolean;
	planned_still_unresolved: unknown[];
	planned_already_resolved: unknown[];
	new_unresolved_threads: unknown[];
	missing_or_outdated_planned_threads: unknown[];
	warnings: string[];
	errors: DiffCurrentError[];
	summary: Record<string, number>;
}

const stackFeedbackDiffCurrentParseSchema = z.object({
	harness_session_id: z.string().optional(),
});

interface StackFeedbackDiffCurrentInputResult {
	payload: { stack_plan: unknown; current_thread_state: unknown };
	resolvedInputs: StackFeedbackDiffCurrentResolvedInputs | undefined;
}

export const stackFeedbackDiffCurrentOperation = defineExecOperation({
	spec: {
		name: "stack-feedback-diff-current",
		description: "Compare a stack-feedback-plan against freshly fetched current stack feedback.",
		schema: stackFeedbackDiffCurrentParseSchema,
		handler: runStackFeedbackDiffCurrentOperation,
	},
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: ({ data, fullOutput }) => compactStackFeedbackDiffCurrentResult(data, fullOutput),
	},
});

async function runStackFeedbackDiffCurrentOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof stackFeedbackDiffCurrentParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const stdinResult = await rejectNonEmptyStdin({ commandName: "stack-feedback-diff-current", stdin: ctx.stdin });
	if (stdinResult.type === "error") return failure(stdinResult.errorType, stdinResult.message);
	const inputResult = await loadStackFeedbackDiffCurrentInput(ctx, request);
	if (inputResult.type === "error") return failure(inputResult.errorType, inputResult.message);
	const { payload, resolvedInputs } = inputResult.value;

	const result = diffStackFeedbackCurrent(payload);
	const data = resolvedInputs === undefined ? result : { ...result, resolved_inputs: resolvedInputs };
	if (result.valid && result.safe_to_resolve_planned) return ok(data);
	return negative("Current stack feedback differs from the validated stack plan; do not resolve planned threads without reviewing the drift.", data);
}

function compactStackFeedbackDiffCurrentResult(
	data: unknown,
	fullOutput: PayloadReference,
): { type: "ok"; value: Record<string, unknown> } {
	const result = data as DiffCurrentResult & { resolved_inputs?: unknown };
	return {
		type: "ok",
		value: compactOperationResult({
			operation: "stack-feedback-diff-current",
			counts: result.summary,
			errors: result.errors,
			warnings: result.warnings,
			resolvedInputs: result.resolved_inputs,
			artifacts: { full_output: fullOutput },
			details: { valid: result.valid, safe_to_resolve_planned: result.safe_to_resolve_planned },
		}),
	};
}

async function loadStackFeedbackDiffCurrentInput(
	ctx: PrAddressExecContext,
	request: z.output<typeof stackFeedbackDiffCurrentParseSchema>,
): Promise<OperationResult<StackFeedbackDiffCurrentInputResult, string>> {
	return await loadStackFeedbackDiffCurrentInputFromSession(ctx, request);
}

async function loadStackFeedbackDiffCurrentInputFromSession(
	ctx: PrAddressExecContext,
	request: z.output<typeof stackFeedbackDiffCurrentParseSchema>,
): Promise<OperationResult<StackFeedbackDiffCurrentInputResult, string>> {
	const storeResult = await openPayloadStoreFromContext({ ctx, harnessSessionId: request.harness_session_id });
	if (storeResult.type === "error") return storeResult;
	return await resolveStackFeedbackDiffCurrentSessionInput(storeResult.value);
}

export function diffStackFeedbackCurrent(request: { stack_plan: unknown; current_thread_state: unknown }): DiffCurrentResult {
	const stackPlanResult = stackFeedbackPlanConsumerResultSchema.safeParse(request.stack_plan);
	if (!stackPlanResult.success) return invalidResult([errorItem("invalid_stack_plan_shape", INVALID_STACK_PLAN_SHAPE_MESSAGE)]);
	const currentThreadStateResult = stackFeedbackThreadStateResultSchema.safeParse(request.current_thread_state);
	if (!currentThreadStateResult.success) return invalidResult([errorItem("invalid_current_thread_state_shape", INVALID_CURRENT_THREAD_STATE_SHAPE_MESSAGE)]);

	const stackPlan = stackPlanResult.data;
	const currentThreadState = currentThreadStateResult.data;
	const plannedActionable = actionableReviewThreadItems(stackPlan);
	const plannedKnownKeys = knownReviewThreadKeys(stackPlan);
	const { currentByKey, errors: currentThreadErrors } = currentThreadsByKey(currentThreadState);
	const errors = validationErrors({ stackPlan, currentThreadState, plannedActionable, currentThreadErrors });
	if (errors.length > 0) {
		return semanticInvalidResult({ currentThreadState, plannedActionable, plannedKnownKeys, errors });
	}
	return diffValidStackFeedback({ currentThreadState, plannedActionable, plannedKnownKeys, currentByKey });
}

function diffValidStackFeedback(options: {
	currentThreadState: StackFeedbackCurrentThreadStateResult;
	plannedActionable: readonly StackFeedbackPlanItem[];
	plannedKnownKeys: ReadonlySet<string>;
	currentByKey: ReadonlyMap<string, StackFeedbackThreadStateThread>;
}): DiffCurrentResult {
	const plannedStillUnresolved: unknown[] = [];
	const plannedAlreadyResolved: unknown[] = [];
	const missingOrOutdated: unknown[] = [];
	for (const item of options.plannedActionable) {
		const key = threadKey(item.pr_number, item.thread_id);
		if (key === null) continue;
		const currentThread = options.currentByKey.get(threadKeyString(key[0], key[1]));
		if (currentThread === undefined) {
			missingOrOutdated.push(missingOrOutdatedThread(item, "missing_current_thread"));
			continue;
		}
		if (currentThread.is_resolved) {
			plannedAlreadyResolved.push(plannedThread(item));
			continue;
		}
		const changedFields = materialMetadataMismatch(item, currentThread);
		if (changedFields.length > 0) {
			missingOrOutdated.push(missingOrOutdatedThread(item, changedFields.includes("is_outdated") ? "outdated_changed" : "metadata_changed", changedFields));
			continue;
		}
		plannedStillUnresolved.push(plannedThread(item));
	}
	const newUnresolved = newUnresolvedThreads({ currentThreadState: options.currentThreadState, plannedKnownKeys: options.plannedKnownKeys });
	const safeToResolvePlanned = plannedAlreadyResolved.length === 0 && newUnresolved.length === 0 && missingOrOutdated.length === 0;
	return {
		valid: true,
		safe_to_resolve_planned: safeToResolvePlanned,
		planned_still_unresolved: plannedStillUnresolved,
		planned_already_resolved: plannedAlreadyResolved,
		new_unresolved_threads: newUnresolved,
		missing_or_outdated_planned_threads: missingOrOutdated,
		warnings: [],
		errors: [],
		summary: summary({
			currentThreadState: options.currentThreadState,
			plannedActionable: options.plannedActionable,
			plannedKnownKeys: options.plannedKnownKeys,
			plannedStillUnresolved: plannedStillUnresolved.length,
			plannedAlreadyResolved: plannedAlreadyResolved.length,
			newUnresolvedThreads: newUnresolved.length,
			missingOrOutdatedPlannedThreads: missingOrOutdated.length,
		}),
	};
}

function semanticInvalidResult(options: {
	currentThreadState: StackFeedbackCurrentThreadStateResult;
	plannedActionable: readonly StackFeedbackPlanItem[];
	plannedKnownKeys: ReadonlySet<string>;
	errors: readonly DiffCurrentError[];
}): DiffCurrentResult {
	return {
		valid: false,
		safe_to_resolve_planned: false,
		planned_still_unresolved: [],
		planned_already_resolved: [],
		new_unresolved_threads: [],
		missing_or_outdated_planned_threads: [],
		warnings: [],
		errors: [...options.errors],
		summary: summary({
			currentThreadState: options.currentThreadState,
			plannedActionable: options.plannedActionable,
			plannedKnownKeys: options.plannedKnownKeys,
			plannedStillUnresolved: 0,
			plannedAlreadyResolved: 0,
			newUnresolvedThreads: 0,
			missingOrOutdatedPlannedThreads: 0,
		}),
	};
}

function summary(options: {
	currentThreadState: StackFeedbackCurrentThreadStateResult;
	plannedActionable: readonly StackFeedbackPlanItem[];
	plannedKnownKeys: ReadonlySet<string>;
	plannedStillUnresolved: number;
	plannedAlreadyResolved: number;
	newUnresolvedThreads: number;
	missingOrOutdatedPlannedThreads: number;
}): Record<string, number> {
	return {
		pr_count: options.currentThreadState.stack.length,
		planned_actionable_review_threads: options.plannedActionable.length,
		planned_known_review_threads: options.plannedKnownKeys.size,
		current_unresolved_review_threads: options.currentThreadState.stack.reduce((total, prResult) => total + prResult.review_threads.filter((thread) => !thread.is_resolved).length, 0),
		planned_still_unresolved: options.plannedStillUnresolved,
		planned_already_resolved: options.plannedAlreadyResolved,
		new_unresolved_threads: options.newUnresolvedThreads,
		missing_or_outdated_planned_threads: options.missingOrOutdatedPlannedThreads,
	};
}

function invalidResult(errors: readonly DiffCurrentError[]): DiffCurrentResult {
	return {
		valid: false,
		safe_to_resolve_planned: false,
		planned_still_unresolved: [],
		planned_already_resolved: [],
		new_unresolved_threads: [],
		missing_or_outdated_planned_threads: [],
		warnings: [],
		errors: [...errors],
		summary: {
			pr_count: 0,
			planned_actionable_review_threads: 0,
			planned_known_review_threads: 0,
			current_unresolved_review_threads: 0,
			planned_still_unresolved: 0,
			planned_already_resolved: 0,
			new_unresolved_threads: 0,
			missing_or_outdated_planned_threads: 0,
		},
	};
}

function validationErrors(options: {
	stackPlan: StackFeedbackPlanResult;
	currentThreadState: StackFeedbackCurrentThreadStateResult;
	plannedActionable: readonly StackFeedbackPlanItem[];
	currentThreadErrors: readonly DiffCurrentError[];
}): DiffCurrentError[] {
	const errors: DiffCurrentError[] = [];
	if (!options.stackPlan.valid) errors.push(errorItem("invalid_stack_plan", "stack_plan.valid must be true before diffing current stack feedback."));
	errors.push(...currentPrErrors(options.currentThreadState));
	errors.push(...validateStackMembership(options.stackPlan, options.currentThreadState.stack.map((prResult) => prResult.pr_number)));
	errors.push(...plannedThreadKeyErrors(options.plannedActionable));
	errors.push(...options.currentThreadErrors);
	return errors;
}

function currentPrErrors(currentThreadState: StackFeedbackCurrentThreadStateResult): DiffCurrentError[] {
	return duplicateValues(currentThreadState.stack.map((prResult) => prResult.pr_number)).map((prNumber) => errorItem("duplicate_current_pr", `current_thread_state contains duplicate PR number ${prNumber}.`, { prNumber }));
}

function plannedThreadKeyErrors(plannedActionable: readonly StackFeedbackPlanItem[]): DiffCurrentError[] {
	const errors: DiffCurrentError[] = [];
	const keys: ThreadKey[] = [];
	for (const item of plannedActionable) {
		const key = threadKey(item.pr_number, item.thread_id);
		if (key === null) {
			errors.push(errorItem("invalid_planned_thread_item", "Stack plan review-thread item must include a non-empty thread_id.", { prNumber: item.pr_number }));
			continue;
		}
		keys.push(key);
	}
	for (const key of duplicateThreadKeys(keys)) {
		errors.push(errorItem("duplicate_planned_thread", `Stack plan contains duplicate PR #${key[0]} thread ${key[1]}.`, { prNumber: key[0], threadId: key[1] }));
	}
	return errors;
}

function currentThreadsByKey(currentThreadState: StackFeedbackCurrentThreadStateResult): { currentByKey: ReadonlyMap<string, StackFeedbackThreadStateThread>; errors: readonly DiffCurrentError[] } {
	const currentByKey = new Map<string, StackFeedbackThreadStateThread>();
	const errors: DiffCurrentError[] = [];
	for (const prResult of currentThreadState.stack) {
		for (const thread of prResult.review_threads) {
			const key = threadKey(prResult.pr_number, thread.thread_id);
			if (key === null) {
				errors.push(errorItem("invalid_current_thread", "current_thread_state review thread must include a non-empty thread_id.", { prNumber: prResult.pr_number }));
				continue;
			}
			const serializedKey = threadKeyString(key[0], key[1]);
			if (currentByKey.has(serializedKey)) {
				errors.push(errorItem("duplicate_current_thread", `current_thread_state contains duplicate PR #${key[0]} thread ${key[1]}.`, { prNumber: key[0], threadId: key[1] }));
				continue;
			}
			currentByKey.set(serializedKey, thread);
		}
	}
	return { currentByKey, errors };
}

function validateStackMembership(stackPlan: StackFeedbackPlanResult, currentPrNumbers: readonly number[]): DiffCurrentError[] {
	const plannedNumbers = plannedPrNumbers(stackPlan);
	if (plannedNumbers.length === 0 && stackPlan.pr_count > 0) return [errorItem("stack_plan_pr_numbers_unavailable", "stack_plan does not expose PR numbers needed for stack membership diffing.")];
	const currentPrSet = new Set(currentPrNumbers);
	if (currentPrSet.size !== currentPrNumbers.length) return [];
	const errors: DiffCurrentError[] = [];
	for (const prNumber of plannedNumbers) {
		if (!currentPrSet.has(prNumber)) errors.push(errorItem("missing_current_pr", `current_thread_state is missing planned PR #${prNumber}.`, { prNumber }));
	}
	const plannedSet = new Set(plannedNumbers);
	for (const prNumber of currentPrNumbers) {
		if (!plannedSet.has(prNumber)) errors.push(errorItem("unknown_current_pr", `current_thread_state contains PR #${prNumber} not present in stack_plan.`, { prNumber }));
	}
	return errors;
}

function materialMetadataMismatch(plannedItem: StackFeedbackPlanItem, currentThread: StackFeedbackThreadStateThread): string[] {
	const changed: string[] = [];
	if (plannedItem.path !== currentThread.path) changed.push("path");
	if (plannedItem.line !== currentThread.line) changed.push("line");
	if (plannedItem.start_line !== currentThread.start_line) changed.push("start_line");
	if (plannedItem.is_outdated !== currentThread.is_outdated) changed.push("is_outdated");
	return changed;
}

function plannedThread(item: StackFeedbackPlanItem): Record<string, unknown> {
	return {
		pr_number: item.pr_number,
		branch: item.branch,
		title: item.title,
		url: item.url,
		thread_id: trimRequired(item.thread_id),
		source_batch_id: item.source_batch_id,
		summary: item.summary,
		path: item.path,
		line: item.line,
		start_line: item.start_line,
		is_outdated: item.is_outdated,
	};
}

function missingOrOutdatedThread(item: StackFeedbackPlanItem, reason: string, changedFields: readonly string[] = []): Record<string, unknown> {
	return { ...plannedThread(item), reason, changed_fields: [...changedFields] };
}

function newUnresolvedThreads(options: { currentThreadState: StackFeedbackCurrentThreadStateResult; plannedKnownKeys: ReadonlySet<string> }): unknown[] {
	const items: unknown[] = [];
	for (const prResult of options.currentThreadState.stack) {
		for (const thread of prResult.review_threads) {
			const key = threadKey(prResult.pr_number, thread.thread_id);
			if (key === null || thread.is_resolved || options.plannedKnownKeys.has(threadKeyString(key[0], key[1]))) continue;
			items.push({
				pr_number: prResult.pr_number,
				branch: prResult.branch,
				title: prResult.title,
				url: prResult.url,
				thread_id: key[1],
				path: thread.path,
				line: thread.line,
				start_line: thread.start_line,
				is_outdated: thread.is_outdated,
				comment_count: thread.comment_count,
			});
		}
	}
	return items;
}

interface ErrorItemOptions {
	prNumber?: number | null;
	threadId?: string | null;
}

function errorItem(code: string, message: string, options: ErrorItemOptions = {}): DiffCurrentError {
	return { code, message, pr_number: options.prNumber ?? null, thread_id: options.threadId ?? null };
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
