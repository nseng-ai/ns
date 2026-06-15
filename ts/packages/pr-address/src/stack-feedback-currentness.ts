import { duplicateValues } from "./duplicate-values.ts";
import type { StackFeedbackPlanConsumerItem, StackFeedbackPlanConsumerResult } from "./stack-feedback-plan-contracts.ts";
import type { StackFeedbackThreadStateResult, StackFeedbackThreadStateThread } from "./stack-feedback-thread-state-contracts.ts";
import { duplicateThreadKeys, plannedPrNumbers, threadKey, threadKeyString, type ThreadKey } from "./stack-feedback-thread-index.ts";

export type StackFeedbackPlanItem = StackFeedbackPlanConsumerItem;
export type StackFeedbackPlanResult = StackFeedbackPlanConsumerResult;
export type StackFeedbackCurrentThreadStateResult = StackFeedbackThreadStateResult;

export interface StackFeedbackCurrentnessError {
	code: string;
	message: string;
	pr_number: number | null;
	thread_id: string | null;
}

export function stackInputIntegrityErrors(options: {
	stackPlan: StackFeedbackPlanResult;
	currentThreadState: StackFeedbackCurrentThreadStateResult;
	plannedActionable: readonly StackFeedbackPlanItem[];
	currentThreadErrors: readonly StackFeedbackCurrentnessError[];
}): StackFeedbackCurrentnessError[] {
	const errors: StackFeedbackCurrentnessError[] = [];
	if (!options.stackPlan.valid) errors.push(currentnessErrorItem("invalid_stack_plan", "stack_plan.valid must be true before diffing current stack feedback."));
	errors.push(...currentPrErrors(options.currentThreadState));
	errors.push(...validateStackMembership(options.stackPlan, options.currentThreadState.stack.map((prResult) => prResult.pr_number)));
	errors.push(...plannedThreadKeyErrors(options.plannedActionable));
	errors.push(...options.currentThreadErrors);
	return errors;
}

export function currentThreadIndex(currentThreadState: StackFeedbackCurrentThreadStateResult): {
	currentByKey: ReadonlyMap<string, StackFeedbackThreadStateThread>;
	errors: readonly StackFeedbackCurrentnessError[];
} {
	const currentByKey = new Map<string, StackFeedbackThreadStateThread>();
	const errors: StackFeedbackCurrentnessError[] = [];
	for (const prResult of currentThreadState.stack) {
		for (const thread of prResult.review_threads) {
			const key = threadKey(prResult.pr_number, thread.thread_id);
			if (key === null) {
				errors.push(currentnessErrorItem("invalid_current_thread", "current_thread_state review thread must include a non-empty thread_id.", { prNumber: prResult.pr_number }));
				continue;
			}
			const serializedKey = threadKeyString(key[0], key[1]);
			if (currentByKey.has(serializedKey)) {
				errors.push(currentnessErrorItem("duplicate_current_thread", `current_thread_state contains duplicate PR #${key[0]} thread ${key[1]}.`, { prNumber: key[0], threadId: key[1] }));
				continue;
			}
			currentByKey.set(serializedKey, thread);
		}
	}
	return { currentByKey, errors };
}

export function materialMetadataMismatch(plannedItem: StackFeedbackPlanItem, currentThread: StackFeedbackThreadStateThread): string[] {
	const changed: string[] = [];
	if (plannedItem.path !== currentThread.path) changed.push("path");
	if (plannedItem.line !== currentThread.line) changed.push("line");
	if (plannedItem.start_line !== currentThread.start_line) changed.push("start_line");
	if (plannedItem.is_outdated !== currentThread.is_outdated) changed.push("is_outdated");
	return changed;
}

export function plannedThreadSummary(item: StackFeedbackPlanItem): Record<string, unknown> {
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

export function missingOrOutdatedThreadSummary(item: StackFeedbackPlanItem, reason: string, changedFields: readonly string[] = []): Record<string, unknown> {
	return { ...plannedThreadSummary(item), reason, changed_fields: [...changedFields] };
}

export function newUnresolvedThreads(options: { currentThreadState: StackFeedbackCurrentThreadStateResult; plannedKnownKeys: ReadonlySet<string> }): unknown[] {
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

export function currentnessErrorItem(
	code: string,
	message: string,
	options: { prNumber?: number | null; threadId?: string | null } = {},
): StackFeedbackCurrentnessError {
	return { code, message, pr_number: options.prNumber ?? null, thread_id: options.threadId ?? null };
}

function currentPrErrors(currentThreadState: StackFeedbackCurrentThreadStateResult): StackFeedbackCurrentnessError[] {
	return duplicateValues(currentThreadState.stack.map((prResult) => prResult.pr_number)).map((prNumber) => currentnessErrorItem("duplicate_current_pr", `current_thread_state contains duplicate PR number ${prNumber}.`, { prNumber }));
}

function plannedThreadKeyErrors(plannedActionable: readonly StackFeedbackPlanItem[]): StackFeedbackCurrentnessError[] {
	const errors: StackFeedbackCurrentnessError[] = [];
	const keys: ThreadKey[] = [];
	for (const item of plannedActionable) {
		const key = threadKey(item.pr_number, item.thread_id);
		if (key === null) {
			errors.push(currentnessErrorItem("invalid_planned_thread_item", "Stack plan review-thread item must include a non-empty thread_id.", { prNumber: item.pr_number }));
			continue;
		}
		keys.push(key);
	}
	for (const key of duplicateThreadKeys(keys)) {
		errors.push(currentnessErrorItem("duplicate_planned_thread", `Stack plan contains duplicate PR #${key[0]} thread ${key[1]}.`, { prNumber: key[0], threadId: key[1] }));
	}
	return errors;
}

function validateStackMembership(stackPlan: StackFeedbackPlanResult, currentPrNumbers: readonly number[]): StackFeedbackCurrentnessError[] {
	const plannedNumbers = plannedPrNumbers(stackPlan);
	if (plannedNumbers.length === 0 && stackPlan.pr_count > 0) return [currentnessErrorItem("stack_plan_pr_numbers_unavailable", "stack_plan does not expose PR numbers needed for stack membership diffing.")];
	const currentPrSet = new Set(currentPrNumbers);
	if (currentPrSet.size !== currentPrNumbers.length) return [];
	const errors: StackFeedbackCurrentnessError[] = [];
	for (const prNumber of plannedNumbers) {
		if (!currentPrSet.has(prNumber)) errors.push(currentnessErrorItem("missing_current_pr", `current_thread_state is missing planned PR #${prNumber}.`, { prNumber }));
	}
	const plannedSet = new Set(plannedNumbers);
	for (const prNumber of currentPrNumbers) {
		if (!plannedSet.has(prNumber)) errors.push(currentnessErrorItem("unknown_current_pr", `current_thread_state contains PR #${prNumber} not present in stack_plan.`, { prNumber }));
	}
	return errors;
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
