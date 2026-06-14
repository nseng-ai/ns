import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { loadOperationPayload, type OperationPayloadField } from "./json-input.ts";
import {
	openPayloadStoreFromContext,
	resolveOperationInput,
	resolveStackFeedbackDiffCurrentSessionInput,
	type OperationResult,
	type StackFeedbackDiffCurrentResolvedInputs,
} from "./session-inputs.ts";
import { stackFeedbackPlanConsumerResultSchema, type StackFeedbackPlanConsumerItem, type StackFeedbackPlanConsumerResult } from "./stack-feedback-plan-contracts.ts";
import {
	stackFeedbackPrepResultWithManifestSchema,
	type StackFeedbackPrepPrWithManifest,
	type StackFeedbackPrepResultWithManifest,
	type StackFeedbackPrepThreadManifestItem,
} from "./stack-feedback-prep-contracts.ts";
import { actionableReviewThreadItems, duplicateThreadKeys, knownReviewThreadKeys, plannedPrNumbers, threadKey, threadKeyString, type ThreadKey } from "./stack-feedback-thread-index.ts";

const INVALID_STACK_PLAN_SHAPE_MESSAGE = "stack_plan must be the data object returned by stack-feedback-plan.";
const INVALID_CURRENT_PREP_SHAPE_MESSAGE = "current_prep must be the data object returned by stack-feedback-prep.";
// Either wire payload key may be omitted when its reference option supplies it.
const stackFeedbackDiffCurrentInputSchema = z.looseObject({
	stack_plan: z.unknown().optional(),
	current_prep: z.unknown().optional(),
});
type StackFeedbackDiffCurrentInput = z.infer<typeof stackFeedbackDiffCurrentInputSchema>;
const stackFeedbackDiffCurrentPayloadFields = [
	{
		key: "stack_plan",
		artifactDescription: "a stack-feedback-plan data artifact",
		referenceSchema: z.unknown(),
	},
	{
		key: "current_prep",
		artifactDescription: "a stack-feedback-prep data artifact",
		referenceSchema: z.unknown(),
	},
] as const satisfies readonly OperationPayloadField<StackFeedbackDiffCurrentInput, keyof StackFeedbackDiffCurrentInput & string>[];

type StackFeedbackPlanItem = StackFeedbackPlanConsumerItem;
type StackFeedbackPlanResult = StackFeedbackPlanConsumerResult;
type StackFeedbackPrepResult = StackFeedbackPrepResultWithManifest;
type StackFeedbackPrepPr = StackFeedbackPrepPrWithManifest;

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
	payload_json: z.string().optional(),
	payload_file: z.string().optional(),
	stack_plan_reference: z.string().optional(),
	current_prep_reference: z.string().optional(),
	harness_session_id: z.string().optional(),
});

interface StackFeedbackDiffCurrentInputResult {
	payload: { stack_plan: unknown; current_prep: unknown };
	resolvedInputs: StackFeedbackDiffCurrentResolvedInputs | undefined;
}

export const stackFeedbackDiffCurrentOperation = defineExecOperation({
	spec: {
		name: "stack-feedback-diff-current",
		description: "Compare a stack-feedback-plan against freshly fetched current stack feedback.",
		schema: stackFeedbackDiffCurrentParseSchema,
		handler: runStackFeedbackDiffCurrentOperation,
	},
});

async function runStackFeedbackDiffCurrentOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof stackFeedbackDiffCurrentParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const inputResult = await loadStackFeedbackDiffCurrentInput(ctx, request);
	if (inputResult.type === "error") return failure(inputResult.errorType, inputResult.message);
	const { payload, resolvedInputs } = inputResult.value;

	const result = diffStackFeedbackCurrent(payload);
	const data = resolvedInputs === undefined ? result : { ...result, resolved_inputs: resolvedInputs };
	if (result.valid && result.safe_to_resolve_planned) return ok(data);
	return negative("Current stack feedback differs from the validated stack plan; do not resolve planned threads without reviewing the drift.", data);
}

async function loadStackFeedbackDiffCurrentInput(
	ctx: PrAddressExecContext,
	request: z.output<typeof stackFeedbackDiffCurrentParseSchema>,
): Promise<OperationResult<StackFeedbackDiffCurrentInputResult, string>> {
	const resolved = await resolveOperationInput({
		commandName: "stack-feedback-diff-current",
		explicitSource: {
			present:
				request.payload_json !== undefined ||
				request.payload_file !== undefined ||
				request.stack_plan_reference !== undefined ||
				request.current_prep_reference !== undefined,
			description: "payload input (--payload-json/--payload-file/--stack-plan-reference/--current-prep-reference)",
			resolve: async (stdin) => await loadStackFeedbackDiffCurrentInputFromPayloadSources(request, stdin),
		},
		stdin: { read: ctx.stdin, nonEmptyMode: "payload" },
		sessionSource: {
			selected: false,
			description: "latest stack plan and current prep from the payload session",
			resolve: async () => await loadStackFeedbackDiffCurrentInputFromSession(ctx, request),
		},
		defaultSource: "session",
	});
	if (resolved.type === "error") return resolved;
	return { type: "ok", value: resolved.value.value };
}

async function loadStackFeedbackDiffCurrentInputFromPayloadSources(
	request: z.output<typeof stackFeedbackDiffCurrentParseSchema>,
	stdin: () => Promise<string>,
): Promise<OperationResult<StackFeedbackDiffCurrentInputResult, string>> {
	const payloadResult = await loadOperationPayload({
		commandName: "stack-feedback-diff-current",
		inputDescription: "stack feedback diff JSON payload",
		payloadSchema: stackFeedbackDiffCurrentInputSchema,
		request,
		stdin,
		canOmitPayloadWhenAllFieldsReferenced: true,
		fields: stackFeedbackDiffCurrentPayloadFields,
	});
	if (payloadResult.type === "error") return { type: "error", errorType: payloadResult.error.errorType, message: payloadResult.error.message };
	const payloadValue = payloadResult.value;
	if (payloadValue.stack_plan === undefined || payloadValue.current_prep === undefined) {
		throw new Error("stack-feedback-diff-current payload fields missing despite field resolution");
	}
	return { type: "ok", value: { payload: { stack_plan: payloadValue.stack_plan, current_prep: payloadValue.current_prep }, resolvedInputs: undefined } };
}

async function loadStackFeedbackDiffCurrentInputFromSession(
	ctx: PrAddressExecContext,
	request: z.output<typeof stackFeedbackDiffCurrentParseSchema>,
): Promise<OperationResult<StackFeedbackDiffCurrentInputResult, string>> {
	const storeResult = await openPayloadStoreFromContext({ ctx, harnessSessionId: request.harness_session_id });
	if (storeResult.type === "error") return storeResult;
	return await resolveStackFeedbackDiffCurrentSessionInput(storeResult.value);
}

export function diffStackFeedbackCurrent(request: { stack_plan: unknown; current_prep: unknown }): DiffCurrentResult {
	const stackPlanResult = stackFeedbackPlanConsumerResultSchema.safeParse(request.stack_plan);
	if (!stackPlanResult.success) return invalidResult([errorItem("invalid_stack_plan_shape", INVALID_STACK_PLAN_SHAPE_MESSAGE)]);
	const currentPrepResult = stackFeedbackPrepResultWithManifestSchema.safeParse(request.current_prep);
	if (!currentPrepResult.success) return invalidResult([errorItem("invalid_current_prep_shape", INVALID_CURRENT_PREP_SHAPE_MESSAGE)]);

	const stackPlan = stackPlanResult.data;
	const currentPrep = currentPrepResult.data;
	const warnings = currentPrepWarnings(currentPrep);
	const plannedActionable = actionableReviewThreadItems(stackPlan);
	const plannedKnownKeys = knownReviewThreadKeys(stackPlan);
	const { currentByKey, errors: currentThreadErrors } = currentThreadsByKey(currentPrep);
	const errors = validationErrors({ stackPlan, currentPrep, plannedActionable, currentThreadErrors });
	if (errors.length > 0) {
		return semanticInvalidResult({ currentPrep, plannedActionable, plannedKnownKeys, warnings, errors });
	}
	return diffValidStackFeedback({ currentPrep, plannedActionable, plannedKnownKeys, currentByKey, warnings });
}

function diffValidStackFeedback(options: {
	currentPrep: StackFeedbackPrepResult;
	plannedActionable: readonly StackFeedbackPlanItem[];
	plannedKnownKeys: ReadonlySet<string>;
	currentByKey: ReadonlyMap<string, StackFeedbackPrepThreadManifestItem>;
	warnings: readonly string[];
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
	const newUnresolved = newUnresolvedThreads({ currentPrep: options.currentPrep, plannedKnownKeys: options.plannedKnownKeys });
	const safeToResolvePlanned = plannedAlreadyResolved.length === 0 && newUnresolved.length === 0 && missingOrOutdated.length === 0 && options.warnings.length === 0;
	return {
		valid: true,
		safe_to_resolve_planned: safeToResolvePlanned,
		planned_still_unresolved: plannedStillUnresolved,
		planned_already_resolved: plannedAlreadyResolved,
		new_unresolved_threads: newUnresolved,
		missing_or_outdated_planned_threads: missingOrOutdated,
		warnings: [...options.warnings],
		errors: [],
		summary: summary({
			currentPrep: options.currentPrep,
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
	currentPrep: StackFeedbackPrepResult;
	plannedActionable: readonly StackFeedbackPlanItem[];
	plannedKnownKeys: ReadonlySet<string>;
	warnings: readonly string[];
	errors: readonly DiffCurrentError[];
}): DiffCurrentResult {
	return {
		valid: false,
		safe_to_resolve_planned: false,
		planned_still_unresolved: [],
		planned_already_resolved: [],
		new_unresolved_threads: [],
		missing_or_outdated_planned_threads: [],
		warnings: [...options.warnings],
		errors: [...options.errors],
		summary: summary({
			currentPrep: options.currentPrep,
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
	currentPrep: StackFeedbackPrepResult;
	plannedActionable: readonly StackFeedbackPlanItem[];
	plannedKnownKeys: ReadonlySet<string>;
	plannedStillUnresolved: number;
	plannedAlreadyResolved: number;
	newUnresolvedThreads: number;
	missingOrOutdatedPlannedThreads: number;
}): Record<string, number> {
	return {
		pr_count: options.currentPrep.stack.length,
		planned_actionable_review_threads: options.plannedActionable.length,
		planned_known_review_threads: options.plannedKnownKeys.size,
		current_unresolved_review_threads: options.currentPrep.stack.reduce((total, prResult) => total + prResult.manifest.review_threads.filter((thread) => !thread.is_resolved).length, 0),
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

function currentPrepWarnings(currentPrep: StackFeedbackPrepResult): string[] {
	if (currentPrep.include_resolved) return [];
	return ["current_prep was not fetched with include_resolved=true; already-resolved planned threads cannot be distinguished from missing threads."];
}

function validationErrors(options: {
	stackPlan: StackFeedbackPlanResult;
	currentPrep: StackFeedbackPrepResult;
	plannedActionable: readonly StackFeedbackPlanItem[];
	currentThreadErrors: readonly DiffCurrentError[];
}): DiffCurrentError[] {
	const errors: DiffCurrentError[] = [];
	if (!options.stackPlan.valid) errors.push(errorItem("invalid_stack_plan", "stack_plan.valid must be true before diffing current stack feedback."));
	errors.push(...currentPrErrors(options.currentPrep));
	errors.push(...validateStackMembership(options.stackPlan, options.currentPrep.stack.map((prResult) => prResult.pr_number)));
	errors.push(...plannedThreadKeyErrors(options.plannedActionable));
	errors.push(...options.currentThreadErrors);
	return errors;
}

function currentPrErrors(currentPrep: StackFeedbackPrepResult): DiffCurrentError[] {
	return duplicateValues(currentPrep.stack.map((prResult) => prResult.pr_number)).map((prNumber) => errorItem("duplicate_current_pr", `current_prep contains duplicate PR number ${prNumber}.`, { prNumber }));
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

function currentThreadsByKey(currentPrep: StackFeedbackPrepResult): { currentByKey: ReadonlyMap<string, StackFeedbackPrepThreadManifestItem>; errors: readonly DiffCurrentError[] } {
	const currentByKey = new Map<string, StackFeedbackPrepThreadManifestItem>();
	const errors: DiffCurrentError[] = [];
	for (const prResult of currentPrep.stack) {
		for (const thread of prResult.manifest.review_threads) {
			const key = threadKey(prResult.pr_number, thread.thread_id);
			if (key === null) {
				errors.push(errorItem("invalid_current_thread", "current_prep review thread must include a non-empty thread_id.", { prNumber: prResult.pr_number }));
				continue;
			}
			const serializedKey = threadKeyString(key[0], key[1]);
			if (currentByKey.has(serializedKey)) {
				errors.push(errorItem("duplicate_current_thread", `current_prep contains duplicate PR #${key[0]} thread ${key[1]}.`, { prNumber: key[0], threadId: key[1] }));
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
		if (!currentPrSet.has(prNumber)) errors.push(errorItem("missing_current_pr", `current_prep is missing planned PR #${prNumber}.`, { prNumber }));
	}
	const plannedSet = new Set(plannedNumbers);
	for (const prNumber of currentPrNumbers) {
		if (!plannedSet.has(prNumber)) errors.push(errorItem("unknown_current_pr", `current_prep contains PR #${prNumber} not present in stack_plan.`, { prNumber }));
	}
	return errors;
}

function materialMetadataMismatch(plannedItem: StackFeedbackPlanItem, currentThread: StackFeedbackPrepThreadManifestItem): string[] {
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

function newUnresolvedThreads(options: { currentPrep: StackFeedbackPrepResult; plannedKnownKeys: ReadonlySet<string> }): unknown[] {
	const items: unknown[] = [];
	for (const prResult of options.currentPrep.stack) {
		for (const thread of prResult.manifest.review_threads) {
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


function duplicateValues<T>(values: readonly T[]): T[] {
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
