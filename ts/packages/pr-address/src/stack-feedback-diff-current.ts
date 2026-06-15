import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { openPayloadStoreFromContext } from "./payload-store-context.ts";
import {
	rejectNonEmptyStdin,
	resolveStackFeedbackDiffCurrentSessionInput,
	type OperationResult,
	type StackFeedbackDiffCurrentResolvedInputs,
} from "./session-inputs.ts";
import type { PayloadReference } from "./payload-store.ts";
import {
	currentThreadIndex,
	currentnessErrorItem,
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
import { stackFeedbackPlanConsumerResultSchema } from "./stack-feedback-plan-contracts.ts";
import { stackFeedbackThreadStateResultSchema, type StackFeedbackThreadStateThread } from "./stack-feedback-thread-state-contracts.ts";
import { compactOperationResult } from "./stdout-mode.ts";
import { actionableReviewThreadItems, knownReviewThreadKeys, threadKey, threadKeyString } from "./stack-feedback-thread-index.ts";

const INVALID_STACK_PLAN_SHAPE_MESSAGE = "stack_plan must be the data object returned by stack-feedback-plan.";
const INVALID_CURRENT_THREAD_STATE_SHAPE_MESSAGE = "current_thread_state must be the data object returned by stack-feedback-thread-state.";
type DiffCurrentError = StackFeedbackCurrentnessError;

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
	const { currentByKey, errors: currentThreadErrors } = currentThreadIndex(currentThreadState);
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
			missingOrOutdated.push(missingOrOutdatedThreadSummary(item, "missing_current_thread"));
			continue;
		}
		if (currentThread.is_resolved) {
			plannedAlreadyResolved.push(plannedThreadSummary(item));
			continue;
		}
		const changedFields = materialMetadataMismatch(item, currentThread);
		if (changedFields.length > 0) {
			missingOrOutdated.push(missingOrOutdatedThreadSummary(item, changedFields.includes("is_outdated") ? "outdated_changed" : "metadata_changed", changedFields));
			continue;
		}
		plannedStillUnresolved.push(plannedThreadSummary(item));
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
	errors.push(...stackInputIntegrityErrors(options));
	return errors;
}

interface ErrorItemOptions {
	prNumber?: number | null;
	threadId?: string | null;
}

function errorItem(code: string, message: string, options: ErrorItemOptions = {}): DiffCurrentError {
	return currentnessErrorItem(code, message, options);
}

