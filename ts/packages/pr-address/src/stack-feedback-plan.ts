import { z } from "zod";

import { planFeedback, validateFeedbackClassification, type FeedbackPlanningResult } from "./classification.ts";
import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { ACTION_COMPLEXITIES, APPROVAL_REQUIRED_COMPLEXITIES, type FeedbackPlanActionItem, type FeedbackPlanBatch, type FeedbackPlanInformationalItem } from "./feedback-plan-contracts.ts";
import type { PayloadArtifactStore, PayloadReference } from "./payload-store.ts";
import {
	type DecisionKind,
	type StackFeedbackAutomationDiscussionSummary,
	type StackFeedbackDecisionDocketItem,
	type StackFeedbackPlanBatch,
	type StackFeedbackPlanInput,
	type StackFeedbackPlanInformationalItem,
	type StackFeedbackPlanItem,
	type StackFeedbackPlanResolvedInputs,
	type StackFeedbackPlanResult,
	type StackFeedbackPlanValidationSummary,
} from "./stack-feedback-plan-contracts.ts";
import type { StackFeedbackPrepPrResultInput } from "./stack-feedback-prep-contracts.ts";
import { isAutomationDiscussionTriageItem, triageSummary, type StackDiscussionTriageItem } from "./stack-feedback-triage.ts";
import { openPayloadStoreFromContext } from "./payload-store-context.ts";
import { stackArtifactDescriptor } from "./session-artifacts.ts";
import { rejectNonEmptyStdin, resolveStackFeedbackPlanSessionInput, type OperationResult } from "./session-inputs.ts";
import { compactOperationResult } from "./stdout-mode.ts";

const stackFeedbackPlanParseSchema = z.object({
	harness_session_id: z.string().optional(),
});

interface StackFeedbackPlanInputResult {
	payload: StackFeedbackPlanInput;
	resolvedInputs: StackFeedbackPlanResolvedInputs | undefined;
}

export const stackFeedbackPlanOperation = defineExecOperation({
	spec: {
		name: "stack-feedback-plan",
		description: "Validate stack feedback classifications and merge deterministic per-PR plans.",
		schema: stackFeedbackPlanParseSchema,
		handler: runStackFeedbackPlanOperation,
	},
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: ({ data, fullOutput }) => ({ type: "ok", value: compactPlanOperationResult(data as StackFeedbackPlanResult, fullOutput) }),
	},
});

async function runStackFeedbackPlanOperation(ctx: PrAddressExecContext, request: z.output<typeof stackFeedbackPlanParseSchema>): Promise<ClinkrExit<unknown>> {
	const stdinResult = await rejectNonEmptyStdin({ commandName: "stack-feedback-plan", stdin: ctx.stdin });
	if (stdinResult.type === "error") return failure(stdinResult.errorType, stdinResult.message);
	const storeResult = await openPayloadStoreFromContext({ ctx, harnessSessionId: request.harness_session_id });
	if (storeResult.type === "error") return failure(storeResult.errorType, storeResult.message);
	const store = storeResult.value;

	const sessionPayload = await loadStackFeedbackPlanInput(store);
	if (sessionPayload.type === "error") return failure(sessionPayload.errorType, sessionPayload.message);
	const { payload, resolvedInputs } = sessionPayload.value;

	const classificationsResult = classificationsByPr(payload);
	if (classificationsResult.type === "error") return failure("invalid_request", classificationsResult.message);
	const classificationByPr = classificationsResult.value;

	const validations = payload.prep.stack.map((prResult) => ({
		prResult,
		validation: validateFeedbackClassification({ manifest: prResult.manifest, classification: classificationByPr.get(prResult.pr_number) }),
	}));
	const validationSummary: StackFeedbackPlanValidationSummary = {
		all_valid: validations.every(({ validation }) => validation.valid),
		per_pr: validations.map(({ prResult, validation }) => ({
			pr_number: pythonOrPrNumber(validation.pr_number, prResult.pr_number),
			valid: validation.valid,
			counts: validation.counts,
			errors: validation.errors,
		})),
	};
	if (!validationSummary.all_valid) {
		const negativeResult = emptyPlanResult({ sessionId: store.sessionId, prCount: payload.prep.stack.length, validation: validationSummary, resolvedInputs });
		return negative("Stack feedback classification failed validation; no stack plan produced.", negativeResult);
	}

	const prPlans: PrPlanPair[] = payload.prep.stack.map((prResult) => ({
		prResult,
		plan: planFeedback({ manifest: prResult.manifest, classification: classificationByPr.get(prResult.pr_number) }),
	}));
	if (!prPlans.every(({ plan }) => plan.valid)) throw new Error("validated stack classifications must produce valid per-PR plans");
	const resultWithoutReference = mergedStackPlanResult({
		sessionId: store.sessionId,
		prep: payload.prep,
		validation: validationSummary,
		prPlans,
		resolvedInputs,
	});
	const stackPlanReference = await store.writeJsonArtifact({ descriptor: stackArtifactDescriptor("plan"), role: "summary", payload: resultWithoutReference });
	if (stackPlanReference.type === "error") return failure(stackPlanReference.errorType, stackPlanReference.message);
	const result: StackFeedbackPlanResult = { ...resultWithoutReference, stack_plan_reference: stackPlanReference.value };
	return ok(result);
}

async function loadStackFeedbackPlanInput(store: PayloadArtifactStore): Promise<OperationResult<StackFeedbackPlanInputResult, string>> {
	return await resolveStackFeedbackPlanSessionInput(store);
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

function emptyPlanResult(options: {
	sessionId: string;
	prCount: number;
	validation: StackFeedbackPlanValidationSummary;
	resolvedInputs: StackFeedbackPlanResolvedInputs | undefined;
}): StackFeedbackPlanResult {
	return {
		valid: false,
		harness_session_id: options.sessionId,
		pr_count: options.prCount,
		validation: options.validation,
		batches: [],
		informational: [],
		automation_discussion_summary: null,
		decision_docket: [],
		stack_plan_reference: null,
		resolved_inputs: options.resolvedInputs,
		summary: null,
	};
}

interface PrPlanPair {
	prResult: StackFeedbackPrepPrResultInput;
	plan: FeedbackPlanningResult;
}

interface StackDiscussionTriageIndex {
	summary: StackFeedbackAutomationDiscussionSummary;
	itemByKey: ReadonlyMap<string, StackDiscussionTriageItem>;
}

function mergedStackPlanResult(options: {
	sessionId: string;
	prep: StackFeedbackPlanInput["prep"];
	validation: StackFeedbackPlanValidationSummary;
	prPlans: readonly PrPlanPair[];
	resolvedInputs: StackFeedbackPlanResolvedInputs | undefined;
}): StackFeedbackPlanResult {
	const batches = mergedBatches(options.prPlans);
	const informational = mergedInformational(options.prPlans);
	const triageIndex = buildStackDiscussionTriageIndex(options.prep);
	const actionItems = batches.flatMap((batch) => batch.items);
	return {
		valid: true,
		harness_session_id: options.sessionId,
		pr_count: options.prep.stack.length,
		validation: options.validation,
		batches,
		informational,
		automation_discussion_summary: triageIndex.summary,
		decision_docket: decisionDocket(triageIndex, batches, informational),
		stack_plan_reference: null,
		resolved_inputs: options.resolvedInputs,
		summary: {
			actionable_items: actionItems.length,
			approval_required_items: actionItems.filter((item) => item.approval_required).length,
			informational_items: informational.length,
			automation_discussion_comments: triageIndex.summary.automation_like,
		},
	};
}

function mergedBatches(prPlans: readonly PrPlanPair[]): StackFeedbackPlanBatch[] {
	const batches: StackFeedbackPlanBatch[] = [];
	for (const complexity of ACTION_COMPLEXITIES) {
		const items: StackFeedbackPlanItem[] = [];
		for (const { prResult, plan } of prPlans) {
			const sourceBatch = plan.batches.find((batch) => batch.batch_id === complexity);
			if (sourceBatch !== undefined) {
				for (const item of sourceBatch.items) items.push(actionItem(prResult, sourceBatch, item));
			}
		}
		if (items.length > 0) {
			batches.push({ batch_id: complexity, complexity, approval_required: APPROVAL_REQUIRED_COMPLEXITIES.has(complexity), items });
		}
	}
	return batches;
}

function actionItem(prResult: StackFeedbackPrepPrResultInput, sourceBatch: FeedbackPlanBatch, item: FeedbackPlanActionItem): StackFeedbackPlanItem {
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

function mergedInformational(prPlans: readonly PrPlanPair[]): StackFeedbackPlanInformationalItem[] {
	const items: StackFeedbackPlanInformationalItem[] = [];
	for (const { prResult, plan } of prPlans) {
		for (const item of plan.informational) items.push(informationalItem(prResult, item));
	}
	return items;
}

function informationalItem(prResult: StackFeedbackPrepPrResultInput, item: FeedbackPlanInformationalItem): StackFeedbackPlanInformationalItem {
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

function buildStackDiscussionTriageIndex(prep: StackFeedbackPlanInput["prep"]): StackDiscussionTriageIndex {
	const itemByKey = new Map<string, StackDiscussionTriageItem>();
	const items: StackDiscussionTriageItem[] = [];
	for (const prResult of prep.stack) {
		for (const item of prResult.discussion_triage.items) {
			items.push(item);
			itemByKey.set(discussionTriageKey(prResult.pr_number, item.comment_id), item);
		}
	}
	const summary = triageSummary(items);
	return {
		summary: {
			automation_like: summary.automation_like,
			human_like: summary.human_like,
			needs_agent_review: summary.needs_agent_review,
			by_reason: summary.by_reason,
		},
		itemByKey,
	};
}

function discussionTriageKey(prNumber: number, discussionCommentId: number): string {
	return `${prNumber}\u0000${discussionCommentId}`;
}

function decisionDocket(
	triageIndex: StackDiscussionTriageIndex,
	batches: readonly StackFeedbackPlanBatch[],
	informational: readonly StackFeedbackPlanInformationalItem[],
): StackFeedbackDecisionDocketItem[] {
	const docket: StackFeedbackDecisionDocketItem[] = [];
	for (const batch of batches) {
		for (const item of batch.items) {
			if (item.approval_required) {
				docket.push(actionDecision(item, "approval_required_action"));
			} else if (item.source_kind === "discussion_comment" && !isAutomationDiscussion(triageIndex, item.pr_number, item.discussion_comment_id)) {
				docket.push(actionDecision(item, "discussion_comment_action"));
			}
		}
	}
	for (const item of informational) {
		if (item.user_decision_required) {
			docket.push(informationalDecision(item, "informational_review_thread"));
		} else if (item.source_kind === "discussion_comment" && !isAutomationDiscussion(triageIndex, item.pr_number, item.discussion_comment_id)) {
			docket.push(informationalDecision(item, "discussion_comment_review"));
		}
	}
	return docket;
}

function isAutomationDiscussion(triageIndex: StackDiscussionTriageIndex, prNumber: number, discussionCommentId: number | null): boolean {
	if (discussionCommentId === null) return false;
	const item = triageIndex.itemByKey.get(discussionTriageKey(prNumber, discussionCommentId));
	if (item === undefined) return false;
	return isAutomationDiscussionTriageItem(item);
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

function compactPlanOperationResult(result: StackFeedbackPlanResult, fullOutput: PayloadReference): Record<string, unknown> {
	const compact = compactPlanResult(result);
	const produced = result.stack_plan_reference === null ? [] : [{ kind: "stack-plan", reference: result.stack_plan_reference }];
	return compactOperationResult({
		operation: "stack-feedback-plan",
		counts: result.summary === null ? { pr_count: result.pr_count, batches: result.batches.length, informational: result.informational.length } : { ...result.summary },
		errors: result.validation.per_pr.flatMap((item) => item.errors),
		resolvedInputs: result.resolved_inputs,
		artifacts: { full_output: fullOutput, produced },
		details: compact,
	});
}

function compactPlanResult(result: StackFeedbackPlanResult): Record<string, unknown> {
	return {
		valid: result.valid,
		harness_session_id: result.harness_session_id,
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
		resolved_inputs: result.resolved_inputs,
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

function pythonRepr(value: string): string {
	return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function pythonTupleRepr(values: ReadonlyArray<string | number>): string {
	const parts = values.map((value) => (typeof value === "number" ? String(value) : pythonRepr(value)));
	if (parts.length === 1) return `(${parts[0]},)`;
	return `(${parts.join(", ")})`;
}
