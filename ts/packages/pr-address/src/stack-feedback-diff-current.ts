import { z } from "zod";

import { clinkrFailure, clinkrNegative, clinkrOk } from "./clinkr-envelope.ts";
import { feedbackPlanActionItemSchema, feedbackPlanInformationalItemSchema } from "./feedback-plan-contracts.ts";
import { loadJsonInput } from "./json-input.ts";
import { hasFlag, parseManagedOptions } from "./managed-options.ts";
import type { ExecOperationDispatchResult, ExecOperationInvocation } from "./operation-registry.ts";

const INVALID_STACK_PLAN_SHAPE_MESSAGE = "stack_plan must be the data object returned by stack-feedback-plan.";
const INVALID_CURRENT_PREP_SHAPE_MESSAGE = "current_prep must be the data object returned by stack-feedback-prep.";

const nullableStringSchema = z.string().nullable().default(null);
const threadManifestItemSchema = z.looseObject({
	thread_id: z.string(),
	path: z.string(),
	line: z.number().int().nullable().default(null),
	start_line: z.number().int().nullable().default(null),
	is_resolved: z.boolean(),
	is_outdated: z.boolean(),
	comment_count: z.number().int().default(0),
});
const stackFeedbackPlanItemMetadataSchema = z.looseObject({
	pr_number: z.number().int(),
	branch: z.string(),
	title: nullableStringSchema,
	source_batch_id: nullableStringSchema,
	approval_required: z.boolean().default(false),
});
const stackFeedbackPlanItemSchema = z.union([
	feedbackPlanActionItemSchema.and(stackFeedbackPlanItemMetadataSchema),
	feedbackPlanInformationalItemSchema.and(stackFeedbackPlanItemMetadataSchema),
]);
const stackFeedbackPlanBatchSchema = z.looseObject({
	batch_id: z.string(),
	complexity: z.string(),
	approval_required: z.boolean(),
	items: z.array(stackFeedbackPlanItemSchema).default([]),
});
const stackFeedbackValidationPrSchema = z.looseObject({ pr_number: z.number().int(), valid: z.boolean().default(true), counts: z.unknown().optional(), errors: z.array(z.unknown()).default([]) });
const stackFeedbackValidationSummarySchema = z.looseObject({ all_valid: z.boolean().default(true), per_pr: z.array(stackFeedbackValidationPrSchema).default([]) });
const stackFeedbackPlanResultSchema = z.looseObject({
	valid: z.boolean(),
	payload_session_id: z.string().optional(),
	pr_count: z.number().int().default(0),
	validation: stackFeedbackValidationSummarySchema,
	batches: z.array(stackFeedbackPlanBatchSchema).default([]),
	informational: z.array(stackFeedbackPlanItemSchema).default([]),
});
const stackFeedbackPrepPrSchema = z.looseObject({
	pr_number: z.number().int(),
	branch: z.string(),
	title: nullableStringSchema,
	url: nullableStringSchema,
	manifest: z.looseObject({ review_threads: z.array(threadManifestItemSchema).default([]) }),
});
const stackFeedbackPrepResultSchema = z.looseObject({
	include_resolved: z.boolean().default(false),
	stack: z.array(stackFeedbackPrepPrSchema).default([]),
});
const stackFeedbackDiffCurrentInputSchema = z.looseObject({
	stack_plan: z.unknown(),
	current_prep: z.unknown(),
});

type StackFeedbackPlanItem = z.infer<typeof stackFeedbackPlanItemSchema>;
type StackFeedbackPlanResult = z.infer<typeof stackFeedbackPlanResultSchema>;
type StackFeedbackPrepResult = z.infer<typeof stackFeedbackPrepResultSchema>;
type StackFeedbackPrepPr = z.infer<typeof stackFeedbackPrepPrSchema>;
type ThreadManifestItem = z.infer<typeof threadManifestItemSchema>;
type ThreadKey = readonly [number, string];

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

export async function runStackFeedbackDiffCurrentOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	if (hasFlag(invocation.args, "--json-schema")) return { type: "fallback" };
	const options = parseManagedOptions(invocation.args, ["--payload-json", "--payload-file"]);
	if (options.type === "error") return { type: "exit", exit: clinkrFailure("invalid_request", options.message) };
	const payloadResult = await loadJsonInput({
		optionValue: options.options.values.get("--payload-json"),
		filePath: options.options.values.get("--payload-file"),
		commandName: "stack-feedback-diff-current",
		inputDescription: "stack feedback diff JSON payload",
		optionName: "--payload-json",
		fileOptionName: "--payload-file",
		schema: stackFeedbackDiffCurrentInputSchema,
		stdin: invocation.deps.stdin,
	});
	if (payloadResult.type === "error") return { type: "exit", exit: clinkrFailure(payloadResult.error.errorType, payloadResult.error.message) };
	const result = diffStackFeedbackCurrent(payloadResult.value);
	if (result.valid && result.safe_to_resolve_planned) return { type: "exit", exit: clinkrOk(result) };
	return {
		type: "exit",
		exit: clinkrNegative(result, "Current stack feedback differs from the validated stack plan; do not resolve planned threads without reviewing the drift."),
	};
}

export function diffStackFeedbackCurrent(request: { stack_plan: unknown; current_prep: unknown }): DiffCurrentResult {
	const stackPlanResult = stackFeedbackPlanResultSchema.safeParse(request.stack_plan);
	if (!stackPlanResult.success) return invalidResult([errorItem("invalid_stack_plan_shape", INVALID_STACK_PLAN_SHAPE_MESSAGE)]);
	const currentPrepResult = stackFeedbackPrepResultSchema.safeParse(request.current_prep);
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
	currentByKey: ReadonlyMap<string, ThreadManifestItem>;
	warnings: readonly string[];
}): DiffCurrentResult {
	const plannedStillUnresolved: unknown[] = [];
	const plannedAlreadyResolved: unknown[] = [];
	const missingOrOutdated: unknown[] = [];
	for (const item of options.plannedActionable) {
		const key = threadKey(item.pr_number, item.thread_id);
		if (key === null) continue;
		const currentThread = options.currentByKey.get(stringKey(key));
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
	return duplicateNumbers(currentPrep.stack.map((prResult) => prResult.pr_number)).map((prNumber) => errorItem("duplicate_current_pr", `current_prep contains duplicate PR number ${prNumber}.`, { prNumber }));
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

function currentThreadsByKey(currentPrep: StackFeedbackPrepResult): { currentByKey: ReadonlyMap<string, ThreadManifestItem>; errors: readonly DiffCurrentError[] } {
	const currentByKey = new Map<string, ThreadManifestItem>();
	const errors: DiffCurrentError[] = [];
	for (const prResult of currentPrep.stack) {
		for (const thread of prResult.manifest.review_threads) {
			const key = threadKey(prResult.pr_number, thread.thread_id);
			if (key === null) {
				errors.push(errorItem("invalid_current_thread", "current_prep review thread must include a non-empty thread_id.", { prNumber: prResult.pr_number }));
				continue;
			}
			const serializedKey = stringKey(key);
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

function materialMetadataMismatch(plannedItem: StackFeedbackPlanItem, currentThread: ThreadManifestItem): string[] {
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
			if (key === null || thread.is_resolved || options.plannedKnownKeys.has(stringKey(key))) continue;
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

function plannedPrNumbers(stackPlan: StackFeedbackPlanResult): number[] {
	if (stackPlan.validation.per_pr.length > 0) return stackPlan.validation.per_pr.map((item) => item.pr_number);
	const prNumbers: number[] = [];
	for (const batch of stackPlan.batches) {
		for (const item of batch.items) prNumbers.push(item.pr_number);
	}
	for (const item of stackPlan.informational) prNumbers.push(item.pr_number);
	return [...new Set(prNumbers)];
}

function actionableReviewThreadItems(stackPlan: StackFeedbackPlanResult): StackFeedbackPlanItem[] {
	return stackPlan.batches.flatMap((batch) => batch.items.filter((item) => item.source_kind === "review_thread"));
}

function knownReviewThreadKeys(stackPlan: StackFeedbackPlanResult): ReadonlySet<string> {
	const keys = new Set<string>();
	for (const item of [...actionableReviewThreadItems(stackPlan), ...stackPlan.informational.filter((item) => item.source_kind === "review_thread")]) {
		const key = threadKey(item.pr_number, item.thread_id);
		if (key !== null) keys.add(stringKey(key));
	}
	return keys;
}

function threadKey(prNumber: number, threadId: string | null): ThreadKey | null {
	const trimmed = trimOptional(threadId);
	if (trimmed === null) return null;
	return [prNumber, trimmed];
}

function duplicateThreadKeys(keys: readonly ThreadKey[]): ThreadKey[] {
	const seen = new Set<string>();
	const duplicates: ThreadKey[] = [];
	const duplicateStrings = new Set<string>();
	for (const key of keys) {
		const serialized = stringKey(key);
		if (seen.has(serialized) && !duplicateStrings.has(serialized)) {
			duplicates.push(key);
			duplicateStrings.add(serialized);
		}
		seen.add(serialized);
	}
	return duplicates;
}

function duplicateNumbers(values: readonly number[]): number[] {
	const seen = new Set<number>();
	const duplicates: number[] = [];
	for (const value of values) {
		if (seen.has(value) && !duplicates.includes(value)) duplicates.push(value);
		seen.add(value);
	}
	return duplicates;
}

function trimOptional(value: string | null): string | null {
	if (value === null) return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function trimRequired(value: string | null): string {
	return trimOptional(value) ?? "";
}

function stringKey(key: ThreadKey): string {
	return `${key[0]}\u0000${key[1]}`;
}

interface ErrorItemOptions {
	prNumber?: number | null;
	threadId?: string | null;
}

function errorItem(code: string, message: string, options: ErrorItemOptions = {}): DiffCurrentError {
	return { code, message, pr_number: options.prNumber ?? null, thread_id: options.threadId ?? null };
}

export function stackFeedbackPrFixture(options: { prNumber: number; branch: string; threads: readonly ThreadManifestItem[] }): StackFeedbackPrepPr {
	return { pr_number: options.prNumber, branch: options.branch, title: null, url: null, manifest: { review_threads: [...options.threads] } };
}
