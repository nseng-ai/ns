import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { z } from "zod";

import {
	planFeedback,
	validateFeedbackClassification,
	type FeedbackClassificationValidationError,
	type FeedbackClassificationValidationResult,
	type FeedbackPlanningResult,
} from "./classification-core.ts";
import { ACTION_COMPLEXITIES, type ActionComplexity, type FeedbackPlanActionItem, type FeedbackPlanBatch, type FeedbackPlanInformationalItem } from "./feedback-plan-contracts.ts";
import { loadArtifactReference, loadJsonInput, resolveXorSourceInput, type JsonInputResult } from "./json-input.ts";
import { githubGateway, parseReadOptions } from "./operation-support.ts";
import type { ExecOperationDispatchResult, ExecOperationInvocation } from "./operation-registry.ts";
import { PayloadStore, type PayloadReference } from "./payload-store.ts";
import {
	compactPrepResult,
	prepareStackFeedbackStack,
	stackFeedbackPrepInputSchema,
	triageSummary,
	type StackFeedbackPrInput,
} from "./stack-feedback-prep-core.ts";

const STDOUT_MODES = new Set(["full", "compact"]);
const APPROVAL_REQUIRED_COMPLEXITIES = new Set<ActionComplexity>(["cross_cutting", "complex"]);
const nullableStringSchema = z.string().nullable().default(null);

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

/** Wire payload for stack-feedback-plan: `prep` may be omitted when `--prep-reference` supplies it. */
const stackFeedbackPlanPayloadSchema = stackFeedbackPlanInputSchema.extend({
	prep: stackPrepResultInputSchema.optional(),
});

type StackPrepPrResultInput = z.infer<typeof stackPrepPrResultSchema>;
type StackPrepResultInput = z.infer<typeof stackPrepResultInputSchema>;
type StackFeedbackPlanInput = z.infer<typeof stackFeedbackPlanInputSchema>;
type DecisionKind = "approval_required_action" | "informational_review_thread" | "discussion_comment_action" | "discussion_comment_review";

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
	const parsed = parseReadOptions(invocation.args, ["--stack-json", "--stack-reference", "--payload-session-id", "--stdout-mode"], ["--include-resolved", "--include-empty-reviews"]);
	if (parsed.type === "error") return exitFailure("invalid_request", parsed.message);
	const unexpectedPositional = parsed.options.positionals[0];
	if (unexpectedPositional !== undefined) return exitFailure("invalid_request", `Unexpected argument for stack-feedback-prep: ${unexpectedPositional}`);
	const stdoutMode = parsed.options.values.get("--stdout-mode") ?? "full";
	// Invalid --stdout-mode values keep legacy click usage-error behavior.
	if (!STDOUT_MODES.has(stdoutMode)) return { type: "fallback" };

	// Python opens the payload store before reading the stack JSON; preserve that ordering.
	const storeResult = await PayloadStore.fromEnvironment({
		explicitSessionId: parsed.options.values.get("--payload-session-id") ?? null,
		env: invocation.deps.env,
		clock: invocation.deps.context.payloadClock,
	});
	if (storeResult.type === "error") return exitFailure(storeResult.errorType, storeResult.message);
	const store = storeResult.value;

	const payloadResult = await resolvePrepStackInput({
		stackJson: parsed.options.values.get("--stack-json"),
		stackReference: parsed.options.values.get("--stack-reference"),
		stdin: invocation.deps.stdin,
	});
	if (payloadResult.type === "error") return exitFailure(payloadResult.error.errorType, payloadResult.error.message);

	const validationMessage = stackInputValidationMessage(payloadResult.value.stack);
	if (validationMessage !== null) return exitFailure("invalid_request", validationMessage);

	const github = githubGateway(invocation);
	if (github.type === "error") return github.result;

	const prepared = await prepareStackFeedbackStack({
		invocation,
		store,
		stack: payloadResult.value.stack,
		github: github.gateway,
		shouldIncludeResolved: parsed.options.flags.has("--include-resolved"),
		shouldIncludeEmptyReviews: parsed.options.flags.has("--include-empty-reviews"),
	});
	if (prepared.type === "error") return prepared.result;
	if (stdoutMode === "compact") return { type: "exit", exit: ok(compactPrepResult(prepared.value.result, prepared.value.stackSummaryReference)) };
	return { type: "exit", exit: ok(prepared.value.result) };
}

export async function runStackFeedbackPlanOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	const parsed = parseReadOptions(invocation.args, ["--payload-json", "--payload-file", "--prep-reference", "--payload-session-id", "--stdout-mode"], []);
	if (parsed.type === "error") return exitFailure("invalid_request", parsed.message);
	const unexpectedPositional = parsed.options.positionals[0];
	if (unexpectedPositional !== undefined) return exitFailure("invalid_request", `Unexpected argument for stack-feedback-plan: ${unexpectedPositional}`);
	const stdoutMode = parsed.options.values.get("--stdout-mode") ?? "full";
	// Invalid --stdout-mode values keep legacy click usage-error behavior.
	if (!STDOUT_MODES.has(stdoutMode)) return { type: "fallback" };

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
		filePath: parsed.options.values.get("--payload-file"),
		commandName: "stack-feedback-plan",
		inputDescription: "stack feedback plan JSON payload",
		optionName: "--payload-json",
		fileOptionName: "--payload-file",
		schema: stackFeedbackPlanPayloadSchema,
		stdin: invocation.deps.stdin,
	});
	if (payloadResult.type === "error") return exitFailure(payloadResult.error.errorType, payloadResult.error.message);

	const prepResult = await resolveXorSourceInput({
		commandName: "stack-feedback-plan",
		embeddedValue: payloadResult.value.prep,
		embeddedKey: "prep",
		referencePath: parsed.options.values.get("--prep-reference"),
		optionName: "--prep-reference",
		artifactDescription: "the stack-feedback-prep data object",
		referenceSchema: stackPrepResultInputSchema,
	});
	if (prepResult.type === "error") return exitFailure(prepResult.error.errorType, prepResult.error.message);
	const payload: StackFeedbackPlanInput = { ...payloadResult.value, prep: prepResult.value };

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
		const negativeExit: ClinkrExit<unknown> = negative(
			"Stack feedback classification failed validation; no stack plan produced.",
			stdoutMode === "compact" ? compactPlanResult(negativeResult) : negativeResult,
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
	if (stdoutMode === "compact") return { type: "exit", exit: ok(compactPlanResult(result)) };
	return { type: "exit", exit: ok(result) };
}

async function resolvePrepStackInput(options: {
	stackJson: string | undefined;
	stackReference: string | undefined;
	stdin: () => Promise<string>;
}): Promise<JsonInputResult<{ stack: StackFeedbackPrInput[] }>> {
	if (options.stackReference === undefined) {
		return await loadJsonInput({
			optionValue: options.stackJson,
			commandName: "stack-feedback-prep",
			inputDescription: "stack JSON payload",
			optionName: "--stack-json",
			schema: stackFeedbackPrepInputSchema,
			stdin: options.stdin,
		});
	}
	if (options.stackJson !== undefined) {
		return {
			type: "error",
			error: { errorType: "invalid_request", message: "stack-feedback-prep cannot mix --stack-json with --stack-reference; pass exactly one stack source." },
		};
	}
	return await loadArtifactReference({
		filePath: options.stackReference,
		commandName: "stack-feedback-prep",
		optionName: "--stack-reference",
		artifactDescription: "a stack JSON payload",
		schema: stackFeedbackPrepInputSchema,
	});
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

function exitFailure(errorType: string, message: string): ExecOperationDispatchResult {
	return { type: "exit", exit: failure(errorType, message) };
}
