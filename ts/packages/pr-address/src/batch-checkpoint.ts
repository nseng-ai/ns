import { z } from "zod";

import { clinkrFailure, clinkrNegative, clinkrOk } from "./clinkr-envelope.ts";
import { feedbackPlanConsumerSchema, type FeedbackPlanActionItem, type FeedbackPlanBatch } from "./feedback-plan-contracts.ts";
import { loadJsonInput } from "./json-input.ts";
import { hasFlag, parseManagedOptions } from "./managed-options.ts";
import { PayloadStore, type PayloadClock, type PayloadReference, type PayloadResult } from "./payload-store.ts";
import type { ExecOperationDispatchResult, ExecOperationInvocation } from "./operation-registry.ts";

const nullableStringSchema = z.string().nullable().default(null);
const validationCommandSchema = z.looseObject({
	command: z.string(),
	status: z.enum(["passed", "failed", "skipped"]),
	exit_code: z.number().int().nullable().default(null),
	summary: nullableStringSchema,
});

const buildErrorSchema = z.looseObject({
	code: z.string(),
	message: z.string(),
	batch_id: nullableStringSchema,
	thread_id: nullableStringSchema,
});

const skippedItemSchema = z.looseObject({
	thread_id: z.string(),
	skip_reason: z.string().nullable().default(null),
	summary: z.string().nullable().default(null),
});

const payloadItemSchema = z.looseObject({
	thread_id: z.string(),
});

const threadPayloadBuildSchema = z.looseObject({
	valid: z.boolean(),
	payload_ready: z.boolean(),
	batch_id: z.string(),
	commit_sha: nullableStringSchema,
	continue_on_error: z.boolean().default(false),
	review_thread_count: z.number().int(),
	resolved_thread_count: z.number().int().default(0),
	skipped_thread_count: z.number().int().default(0),
	ignored_non_thread_items: z.array(z.unknown()).default([]),
	skipped_items: z.array(skippedItemSchema).default([]),
	payload: z.looseObject({ items: z.array(payloadItemSchema).default([]) }).nullable().default(null),
	errors: z.array(buildErrorSchema).default([]),
});

const resolutionResultItemSchema = z.looseObject({
	thread_id: z.string(),
	status: z.enum(["resolved", "failed", "skipped"]),
});

const threadResolutionResultSchema = z.looseObject({
	all_succeeded: z.boolean(),
	results: z.array(resolutionResultItemSchema).default([]),
});

const nonThreadOutcomeInputSchema = z.looseObject({
	source_kind: z.enum(["review", "discussion_comment"]),
	review_id: nullableStringSchema,
	discussion_comment_id: z.number().int().nullable().default(null),
	action: z.enum(["replied", "skipped", "no_reply_needed"]),
	result_comment_id: z.number().int().nullable().default(null),
	reaction_added: z.boolean().nullable().default(null),
	skip_reason: nullableStringSchema,
	summary: nullableStringSchema,
});

export const recordBatchCheckpointInputSchema = z.looseObject({
	plan: feedbackPlanConsumerSchema,
	batch_id: z.string(),
	commit_sha: nullableStringSchema,
	changed_files: z.array(z.string()).default([]),
	validation_commands: z.array(validationCommandSchema).default([]),
	thread_payload_build: threadPayloadBuildSchema.nullable().default(null),
	thread_resolution_result: threadResolutionResultSchema.nullable().default(null),
	non_thread_outcomes: z.array(nonThreadOutcomeInputSchema).default([]),
});

type RecordBatchCheckpointInput = z.infer<typeof recordBatchCheckpointInputSchema>;
type ThreadPayloadBuild = z.infer<typeof threadPayloadBuildSchema>;
type ThreadResolutionResult = z.infer<typeof threadResolutionResultSchema>;
type NonThreadOutcomeInput = z.infer<typeof nonThreadOutcomeInputSchema>;
type NonThreadSourceKind = "review" | "discussion_comment";
type IssueKind = "invalid" | "incomplete";

export interface BatchCheckpointError {
	code: string;
	message: string;
	batch_id: string | null;
	thread_id: string | null;
	review_id: string | null;
	discussion_comment_id: number | null;
	path: string | null;
}

interface BatchCheckpointIssue {
	kind: IssueKind;
	error: BatchCheckpointError;
}

export interface BatchThreadCheckpointSummary {
	review_thread_count: number;
	payload_ready: boolean | null;
	resolved_thread_ids: string[];
	failed_thread_ids: string[];
	skipped_thread_ids: string[];
	skipped_threads: unknown[];
	ignored_non_thread_count: number;
	all_succeeded: boolean | null;
}

interface NonThreadKey {
	sourceKind: NonThreadSourceKind;
	id: string | number;
}

export interface RecordBatchCheckpointResult {
	valid: boolean;
	batch_complete: boolean;
	batch_id: string;
	complexity: string | null;
	approval_required: boolean | null;
	pr_number: number | null;
	payload_path: string | null;
	checkpoint_reference: PayloadReference | null;
	commit_sha: string | null;
	changed_files: string[];
	validation_commands: unknown[];
	selected_items: unknown[];
	thread_summary: BatchThreadCheckpointSummary | null;
	non_thread_outcomes: unknown[];
	errors: BatchCheckpointError[];
	warnings: string[];
}

export async function runRecordBatchCheckpointOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	if (hasFlag(invocation.args, "--json-schema")) return { type: "fallback" };
	const options = parseManagedOptions(invocation.args, ["--payload-json", "--payload-file"]);
	if (options.type === "error") return { type: "exit", exit: clinkrFailure("invalid_request", options.message) };
	const payloadResult = await loadJsonInput({
		optionValue: options.options.values.get("--payload-json"),
		filePath: options.options.values.get("--payload-file"),
		commandName: "record-batch-checkpoint",
		inputDescription: "checkpoint JSON",
		optionName: "--payload-json",
		fileOptionName: "--payload-file",
		schema: recordBatchCheckpointInputSchema,
		stdin: invocation.deps.stdin,
	});
	if (payloadResult.type === "error") return { type: "exit", exit: clinkrFailure(payloadResult.error.errorType, payloadResult.error.message) };

	let checkpointResult = recordBatchCheckpoint(payloadResult.value);
	if (checkpointResult.valid && checkpointResult.payload_path !== null) {
		const written = await writeCheckpointArtifact(checkpointResult, invocation.deps.context.payloadClock);
		if (written.type === "error") return { type: "exit", exit: clinkrFailure(written.errorType, written.message) };
		checkpointResult = { ...checkpointResult, checkpoint_reference: written.value };
	}

	if (checkpointResult.valid && checkpointResult.batch_complete) return { type: "exit", exit: clinkrOk(checkpointResult) };
	return {
		type: "exit",
		exit: clinkrNegative(checkpointResult, "Batch checkpoint evidence is incomplete or failed; do not treat this batch as complete."),
	};
}

async function writeCheckpointArtifact(checkpointResult: RecordBatchCheckpointResult, clock: PayloadClock | undefined): Promise<PayloadResult<PayloadReference>> {
	// Mirrors the Python BatchCheckpointArtifact model field order for byte parity.
	const artifact = {
		pr_number: checkpointResult.pr_number,
		payload_path: checkpointResult.payload_path,
		batch_id: checkpointResult.batch_id,
		complexity: trimRequired(checkpointResult.complexity),
		approval_required: checkpointResult.approval_required === true,
		commit_sha: checkpointResult.commit_sha,
		changed_files: checkpointResult.changed_files,
		validation_commands: checkpointResult.validation_commands,
		selected_items: checkpointResult.selected_items,
		thread_summary: checkpointResult.thread_summary,
		non_thread_outcomes: checkpointResult.non_thread_outcomes,
		warnings: checkpointResult.warnings,
	};
	const storeResult = await PayloadStore.openContainingArtifact(trimRequired(checkpointResult.payload_path), { clock });
	if (storeResult.type === "error") return storeResult;
	return await storeResult.value.writeJsonArtifact({ descriptor: "pr-address-batch-checkpoint", role: "summary", payload: artifact });
}

export function recordBatchCheckpoint(input: unknown): RecordBatchCheckpointResult {
	const request = recordBatchCheckpointInputSchema.parse(input);
	const plan = request.plan;
	const batchId = request.batch_id.trim();
	const commitSha = trimOptional(request.commit_sha);
	if (!plan.valid) {
		return result({ valid: false, isBatchComplete: false, batchId, commitSha, errors: [errorItem({ code: "invalid_plan", message: "plan.valid must be true before recording batch checkpoint evidence.", batchId })] });
	}
	if (batchId === "") return result({ valid: false, isBatchComplete: false, batchId, commitSha, errors: [errorItem({ code: "empty_batch_id", message: "batch_id must be non-empty." })] });
	const selectedBatch = plan.batches.find((batch) => batch.batch_id === batchId) ?? null;
	if (selectedBatch === null) {
		return result({ valid: false, isBatchComplete: false, batchId, prNumber: plan.pr_number, payloadPath: plan.payload_path, commitSha, errors: [errorItem({ code: "unknown_batch", message: `No plan batch found for batch_id '${batchId}'.`, batchId })] });
	}

	const collector = createIssueCollector();
	const warnings: string[] = [];
	const selectedItems = checkpointPlanItems(selectedBatch.items);
	const changedFiles = validatedChangedFiles(request.changed_files, batchId, collector);
	if (changedFiles.length > 0 && commitSha === null) collector.invalid(errorItem({ code: "missing_commit_sha_for_changed_files", message: "commit_sha is required when changed_files is non-empty.", batchId }));
	const validationCommands = validatedValidationCommands(request.validation_commands, batchId, collector);
	const threadSummary = threadSummaryForRequest({ request, selectedBatch, collector, warnings });
	const nonThreadOutcomes = nonThreadOutcomesForRequest({ outcomes: request.non_thread_outcomes, selectedBatch, batchId, collector });
	if (plan.payload_path === null && !collector.hasInvalid()) warnings.push("plan.payload_path is null; checkpoint artifact was not written.");
	const valid = !collector.hasInvalid();
	return result({
		valid,
		isBatchComplete: valid && !collector.hasIssues(),
		batchId,
		complexity: selectedBatch.complexity,
		isApprovalRequired: selectedBatch.approval_required,
		prNumber: plan.pr_number,
		payloadPath: plan.payload_path,
		commitSha,
		changedFiles,
		validationCommands,
		selectedItems,
		threadSummary,
		nonThreadOutcomes,
		errors: collector.errors(),
		warnings,
	});
}

function checkpointPlanItems(items: readonly FeedbackPlanActionItem[]): unknown[] {
	return items.map((item) => ({
		source_kind: item.source_kind,
		summary: item.summary,
		action_summary: item.action_summary,
		review_id: item.review_id,
		thread_id: item.thread_id,
		discussion_comment_id: item.discussion_comment_id,
		path: item.path,
		line: item.line,
		start_line: item.start_line,
		covered_comment_ids: [...item.covered_comment_ids],
		needs_reply: item.needs_reply,
		pre_existing: item.pre_existing,
		author: item.author,
		url: item.url,
	}));
}

function validatedChangedFiles(changedFiles: readonly string[], batchId: string, collector: IssueCollector): string[] {
	const seen = new Set<string>();
	const validated: string[] = [];
	for (const rawPath of changedFiles) {
		const path = rawPath.trim();
		if (path === "") {
			collector.invalid(errorItem({ code: "empty_changed_file", message: "changed_files entries must be non-empty.", batchId }));
			continue;
		}
		if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) {
			collector.invalid(errorItem({ code: "absolute_changed_file", message: `changed_files entries must be relative paths: ${path}`, batchId, path }));
			continue;
		}
		if (path.includes("\\") || /^[A-Za-z]:/.test(path)) {
			collector.invalid(errorItem({ code: "unsafe_changed_file", message: `changed_files entries must be repository-relative forward-slash paths: ${path}`, batchId, path }));
			continue;
		}
		if (path.split("/").includes("..")) {
			collector.invalid(errorItem({ code: "unsafe_changed_file", message: `changed_files entries must not contain traversal segments: ${path}`, batchId, path }));
			continue;
		}
		if (seen.has(path)) {
			collector.invalid(errorItem({ code: "duplicate_changed_file", message: `Duplicate changed file path: ${path}`, batchId, path }));
			continue;
		}
		seen.add(path);
		validated.push(path);
	}
	return validated;
}

function validatedValidationCommands(commands: readonly z.infer<typeof validationCommandSchema>[], batchId: string, collector: IssueCollector): unknown[] {
	const validated: unknown[] = [];
	commands.forEach((command, index) => {
		const commandText = command.command.trim();
		const summary = trimOptional(command.summary);
		if (commandText === "") {
			collector.invalid(errorItem({ code: "empty_validation_command", message: `validation_commands[${index}].command must be non-empty.`, batchId }));
			return;
		}
		if (command.summary !== null && summary === null) {
			collector.invalid(errorItem({ code: "empty_validation_summary", message: `validation_commands[${index}].summary must be non-empty when set.`, batchId }));
			return;
		}
		if (command.status === "failed") collector.incomplete(errorItem({ code: "failed_validation_command", message: `Validation command failed: ${commandText}`, batchId }));
		validated.push({ command: commandText, status: command.status, exit_code: command.exit_code, summary });
	});
	return validated;
}

interface ThreadSummaryForRequestOptions {
	request: RecordBatchCheckpointInput;
	selectedBatch: FeedbackPlanBatch;
	collector: IssueCollector;
	warnings: string[];
}

function threadSummaryForRequest(options: ThreadSummaryForRequestOptions): BatchThreadCheckpointSummary {
	const { request, selectedBatch, collector, warnings } = options;
	const selectedThreadIds = selectedThreadIdsForBatch(selectedBatch);
	const batchId = selectedBatch.batch_id;
	if (selectedThreadIds.length === 0) return noSelectedThreadSummary({ request, batchId, collector, warnings });
	if (request.thread_payload_build === null) {
		collector.invalid(errorItem({ code: "missing_thread_payload_build", message: "thread_payload_build is required for batches with review-thread items.", batchId }));
		return emptyThreadSummary(selectedThreadIds.length);
	}
	const build = request.thread_payload_build;
	let summary = summaryFromPayloadBuild(build);
	if (build.batch_id !== batchId) collector.invalid(errorItem({ code: "thread_payload_build_batch_mismatch", message: `thread_payload_build.batch_id '${build.batch_id}' does not match selected batch_id '${batchId}'.`, batchId }));
	if (!build.valid) for (const buildError of build.errors) collector.invalid(errorFromPayloadBuildError(buildError, batchId));
	validatePayloadBuildThreads({ build, selectedThreadIds, batchId, collector });
	if (build.payload_ready) summary = validateThreadResolutionResult({ resolution: request.thread_resolution_result, build, summary, batchId, collector });
	else if (request.thread_resolution_result !== null) collector.invalid(errorItem({ code: "unexpected_thread_resolution_result", message: "thread_resolution_result must be omitted when thread_payload_build.payload_ready is false.", batchId }));
	return summary;
}

function selectedThreadIdsForBatch(selectedBatch: FeedbackPlanBatch): string[] {
	const threadIds: string[] = [];
	for (const item of selectedBatch.items) {
		if (item.source_kind !== "review_thread") continue;
		const threadId = trimOptional(item.thread_id);
		if (threadId !== null) threadIds.push(threadId);
	}
	return threadIds;
}

interface NoSelectedThreadSummaryOptions {
	request: RecordBatchCheckpointInput;
	batchId: string;
	collector: IssueCollector;
	warnings: string[];
}

function noSelectedThreadSummary(options: NoSelectedThreadSummaryOptions): BatchThreadCheckpointSummary {
	const { request, batchId, collector, warnings } = options;
	if (request.thread_resolution_result !== null) collector.invalid(errorItem({ code: "unexpected_thread_resolution_result", message: "thread_resolution_result must be omitted for batches without review-thread items.", batchId }));
	if (request.thread_payload_build === null) return emptyThreadSummary(0);
	const build = request.thread_payload_build;
	const summary = summaryFromPayloadBuild(build);
	if (build.review_thread_count === 0 && !build.payload_ready) {
		warnings.push("thread_payload_build was supplied for a batch without review-thread items; it was summarized but not required.");
		return summary;
	}
	collector.invalid(errorItem({ code: "unexpected_thread_payload_build", message: "thread_payload_build must be omitted for batches without review-thread items.", batchId }));
	return summary;
}

function emptyThreadSummary(reviewThreadCount: number): BatchThreadCheckpointSummary {
	return { review_thread_count: reviewThreadCount, payload_ready: null, resolved_thread_ids: [], failed_thread_ids: [], skipped_thread_ids: [], skipped_threads: [], ignored_non_thread_count: 0, all_succeeded: null };
}

function summaryFromPayloadBuild(build: ThreadPayloadBuild): BatchThreadCheckpointSummary {
	const payloadThreadIds = build.payload?.items.map((item) => item.thread_id) ?? [];
	return {
		review_thread_count: build.review_thread_count,
		payload_ready: build.payload_ready,
		resolved_thread_ids: payloadThreadIds,
		failed_thread_ids: [],
		skipped_thread_ids: build.skipped_items.map((item) => item.thread_id),
		skipped_threads: build.skipped_items.map((item) => ({ thread_id: item.thread_id, skip_reason: item.skip_reason, summary: item.summary })),
		ignored_non_thread_count: build.ignored_non_thread_items.length,
		all_succeeded: null,
	};
}

interface ValidatePayloadBuildThreadsOptions {
	build: ThreadPayloadBuild;
	selectedThreadIds: readonly string[];
	batchId: string;
	collector: IssueCollector;
}

function validatePayloadBuildThreads(options: ValidatePayloadBuildThreadsOptions): void {
	const { build, selectedThreadIds, batchId, collector } = options;
	const selectedSet = new Set(selectedThreadIds);
	if (selectedSet.size !== selectedThreadIds.length) collector.invalid(errorItem({ code: "duplicate_plan_thread", message: "Selected batch contains duplicate review-thread IDs.", batchId }));
	const payloadThreadIds = new Set(build.payload?.items.map((item) => item.thread_id) ?? []);
	const skippedThreadIds = new Set(build.skipped_items.map((item) => item.thread_id));
	const evidencedThreadIds = new Set([...payloadThreadIds, ...skippedThreadIds]);
	for (const threadId of difference(selectedSet, evidencedThreadIds)) collector.invalid(errorItem({ code: "missing_thread_evidence", message: `Selected thread ${threadId} is missing resolve or skip evidence.`, batchId, threadId }));
	for (const threadId of difference(evidencedThreadIds, selectedSet)) collector.invalid(errorItem({ code: "thread_not_in_selected_batch", message: `Thread evidence references thread ${threadId} outside selected batch.`, batchId, threadId }));
}

interface ValidateThreadResolutionResultOptions {
	resolution: ThreadResolutionResult | null;
	build: ThreadPayloadBuild;
	summary: BatchThreadCheckpointSummary;
	batchId: string;
	collector: IssueCollector;
}

function validateThreadResolutionResult(options: ValidateThreadResolutionResultOptions): BatchThreadCheckpointSummary {
	const { resolution, build, summary, batchId, collector } = options;
	if (build.payload === null) {
		collector.invalid(errorItem({ code: "missing_thread_payload", message: "thread_payload_build.payload_ready is true but payload is missing.", batchId }));
		return summary;
	}
	if (resolution === null) {
		collector.invalid(errorItem({ code: "missing_thread_resolution_result", message: "thread_resolution_result is required when thread_payload_build.payload_ready is true.", batchId }));
		return summary;
	}
	const expectedThreadIds = new Set(build.payload.items.map((item) => item.thread_id));
	const actualThreadIds = new Set(resolution.results.map((item) => item.thread_id));
	for (const threadId of difference(expectedThreadIds, actualThreadIds)) collector.invalid(errorItem({ code: "missing_thread_resolution_result", message: `thread_resolution_result is missing thread ${threadId}.`, batchId, threadId }));
	for (const threadId of difference(actualThreadIds, expectedThreadIds)) collector.invalid(errorItem({ code: "unknown_thread_resolution_result", message: `thread_resolution_result includes unexpected thread ${threadId}.`, batchId, threadId }));
	const resolved = resolution.results.filter((item) => item.status === "resolved").map((item) => item.thread_id);
	const failed = resolution.results.filter((item) => item.status === "failed").map((item) => item.thread_id);
	const skipped = resolution.results.filter((item) => item.status === "skipped").map((item) => item.thread_id);
	const updated = { ...summary, resolved_thread_ids: resolved, failed_thread_ids: failed, skipped_thread_ids: [...summary.skipped_thread_ids, ...skipped], all_succeeded: resolution.all_succeeded };
	if (!resolution.all_succeeded) {
		for (const threadId of [...failed, ...skipped]) collector.incomplete(errorItem({ code: "thread_resolution_failed", message: `Thread resolution did not succeed for ${threadId}.`, batchId, threadId }));
	}
	return updated;
}

function errorFromPayloadBuildError(error: z.infer<typeof buildErrorSchema>, fallbackBatchId: string): BatchCheckpointError {
	return errorItem({ code: error.code, message: error.message, batchId: error.batch_id ?? fallbackBatchId, threadId: error.thread_id });
}

interface NonThreadOutcomesForRequestOptions {
	outcomes: readonly NonThreadOutcomeInput[];
	selectedBatch: FeedbackPlanBatch;
	batchId: string;
	collector: IssueCollector;
}

function nonThreadOutcomesForRequest(options: NonThreadOutcomesForRequestOptions): unknown[] {
	const { outcomes, selectedBatch, batchId, collector } = options;
	const selected = selectedNonThreadItems(selectedBatch);
	const seen = new Set<string>();
	const summaries: unknown[] = [];
	for (const outcome of outcomes) {
		const key = nonThreadOutcomeKey(outcome, batchId, collector);
		if (key === null) continue;
		const keyId = nonThreadKeyId(key);
		if (seen.has(keyId)) {
			collector.invalid(nonThreadKeyError("duplicate_non_thread_outcome", `Duplicate non-thread outcome for ${key.sourceKind} ${key.id}.`, key, batchId));
			continue;
		}
		seen.add(keyId);
		if (!selected.has(keyId)) {
			collector.invalid(nonThreadKeyError("non_thread_outcome_not_in_selected_batch", `Non-thread outcome references ${key.sourceKind} ${key.id} outside selected batch.`, key, batchId));
			continue;
		}
		const summary = validatedNonThreadOutcome({ outcome, key, batchId, collector });
		if (summary !== null) summaries.push(summary);
	}
	for (const keyId of selected.keys()) {
		if (seen.has(keyId)) continue;
		const key = parseNonThreadKeyId(keyId);
		collector.invalid(nonThreadKeyError("missing_non_thread_outcome", `Missing explicit non-thread outcome for ${key.sourceKind} ${key.id}.`, key, batchId));
	}
	return summaries;
}

function selectedNonThreadItems(selectedBatch: FeedbackPlanBatch): Map<string, NonThreadKey> {
	const selected = new Map<string, NonThreadKey>();
	for (const item of selectedBatch.items) {
		if (item.source_kind === "review") {
			const reviewId = trimOptional(item.review_id);
			if (reviewId !== null) selected.set(nonThreadKeyId({ sourceKind: "review", id: reviewId }), { sourceKind: "review", id: reviewId });
		} else if (item.source_kind === "discussion_comment" && item.discussion_comment_id !== null) {
			selected.set(nonThreadKeyId({ sourceKind: "discussion_comment", id: item.discussion_comment_id }), { sourceKind: "discussion_comment", id: item.discussion_comment_id });
		}
	}
	return selected;
}

function nonThreadOutcomeKey(outcome: NonThreadOutcomeInput, batchId: string, collector: IssueCollector): NonThreadKey | null {
	const reviewId = trimOptional(outcome.review_id);
	if (outcome.source_kind === "review") {
		if (reviewId === null) {
			collector.invalid(errorItem({ code: "missing_review_id", message: "review non-thread outcomes require review_id.", batchId }));
			return null;
		}
		if (outcome.discussion_comment_id !== null) {
			collector.invalid(errorItem({ code: "unexpected_discussion_comment_id", message: "review non-thread outcomes must not include discussion_comment_id.", batchId, reviewId, discussionCommentId: outcome.discussion_comment_id }));
			return null;
		}
		return { sourceKind: "review", id: reviewId };
	}
	if (outcome.discussion_comment_id === null) {
		collector.invalid(errorItem({ code: "missing_discussion_comment_id", message: "discussion_comment outcomes require discussion_comment_id.", batchId }));
		return null;
	}
	if (reviewId !== null) {
		collector.invalid(errorItem({ code: "unexpected_review_id", message: "discussion_comment outcomes must not include review_id.", batchId, reviewId, discussionCommentId: outcome.discussion_comment_id }));
		return null;
	}
	return { sourceKind: "discussion_comment", id: outcome.discussion_comment_id };
}

interface ValidatedNonThreadOutcomeOptions {
	outcome: NonThreadOutcomeInput;
	key: NonThreadKey;
	batchId: string;
	collector: IssueCollector;
}

function validatedNonThreadOutcome(options: ValidatedNonThreadOutcomeOptions): unknown | null {
	const { outcome, key, batchId, collector } = options;
	const skipReason = trimOptional(outcome.skip_reason);
	const summary = trimOptional(outcome.summary);
	const keyErrors: BatchCheckpointError[] = [];
	if (outcome.action === "replied") {
		if (outcome.result_comment_id === null) keyErrors.push(nonThreadKeyError("missing_result_comment_id", `replied outcome for ${key.sourceKind} ${key.id} requires result_comment_id.`, key, batchId));
		if (skipReason !== null) keyErrors.push(nonThreadKeyError("replied_outcome_has_skip_reason", `replied outcome for ${key.sourceKind} ${key.id} must not include skip_reason.`, key, batchId));
	} else if (outcome.action === "skipped") {
		if (skipReason === null) keyErrors.push(nonThreadKeyError("missing_skip_reason", `skipped outcome for ${key.sourceKind} ${key.id} requires skip_reason.`, key, batchId));
		if (outcome.result_comment_id !== null) keyErrors.push(nonThreadKeyError("skipped_outcome_has_result_comment_id", `skipped outcome for ${key.sourceKind} ${key.id} must not include result_comment_id.`, key, batchId));
	} else if (summary === null) {
		keyErrors.push(nonThreadKeyError("missing_no_reply_summary", `no_reply_needed outcome for ${key.sourceKind} ${key.id} requires summary.`, key, batchId));
	}
	if (key.sourceKind === "review" && outcome.reaction_added !== null) keyErrors.push(nonThreadKeyError("review_outcome_has_reaction_added", "reaction_added is only valid for discussion_comment outcomes.", key, batchId));
	if (keyErrors.length > 0) {
		collector.extendInvalid(keyErrors);
		return null;
	}
	return {
		source_kind: key.sourceKind,
		review_id: key.sourceKind === "review" ? String(key.id) : null,
		discussion_comment_id: key.sourceKind === "discussion_comment" ? Number(key.id) : null,
		action: outcome.action,
		result_comment_id: outcome.result_comment_id,
		reaction_added: outcome.reaction_added,
		skip_reason: skipReason,
		summary,
	};
}

interface IssueCollector {
	hasInvalid(): boolean;
	hasIssues(): boolean;
	errors(): BatchCheckpointError[];
	invalid(error: BatchCheckpointError): void;
	incomplete(error: BatchCheckpointError): void;
	extendInvalid(errors: readonly BatchCheckpointError[]): void;
}

function createIssueCollector(): IssueCollector {
	const issues: BatchCheckpointIssue[] = [];
	return {
		hasInvalid(): boolean {
			return issues.some((issue) => issue.kind === "invalid");
		},
		hasIssues(): boolean {
			return issues.length > 0;
		},
		errors(): BatchCheckpointError[] {
			return issues.map((issue) => issue.error);
		},
		invalid(error: BatchCheckpointError): void {
			issues.push({ kind: "invalid", error });
		},
		incomplete(error: BatchCheckpointError): void {
			issues.push({ kind: "incomplete", error });
		},
		extendInvalid(errors: readonly BatchCheckpointError[]): void {
			for (const error of errors) issues.push({ kind: "invalid", error });
		},
	};
}

function result(options: {
	valid: boolean;
	isBatchComplete: boolean;
	batchId: string;
	complexity?: string | null | undefined;
	isApprovalRequired?: boolean | null | undefined;
	prNumber?: number | null | undefined;
	payloadPath?: string | null | undefined;
	commitSha?: string | null | undefined;
	changedFiles?: readonly string[] | undefined;
	validationCommands?: readonly unknown[] | undefined;
	selectedItems?: readonly unknown[] | undefined;
	threadSummary?: BatchThreadCheckpointSummary | undefined;
	nonThreadOutcomes?: readonly unknown[] | undefined;
	errors?: readonly BatchCheckpointError[] | undefined;
	warnings?: readonly string[] | undefined;
}): RecordBatchCheckpointResult {
	return {
		valid: options.valid,
		batch_complete: options.isBatchComplete,
		batch_id: options.batchId,
		complexity: options.complexity ?? null,
		approval_required: options.isApprovalRequired ?? null,
		pr_number: options.prNumber ?? null,
		payload_path: options.payloadPath ?? null,
		checkpoint_reference: null,
		commit_sha: options.commitSha ?? null,
		changed_files: [...(options.changedFiles ?? [])],
		validation_commands: [...(options.validationCommands ?? [])],
		selected_items: [...(options.selectedItems ?? [])],
		thread_summary: options.threadSummary ?? null,
		non_thread_outcomes: [...(options.nonThreadOutcomes ?? [])],
		errors: [...(options.errors ?? [])],
		warnings: [...(options.warnings ?? [])],
	};
}

function errorItem(options: {
	code: string;
	message: string;
	batchId?: string | null | undefined;
	threadId?: string | null | undefined;
	reviewId?: string | null | undefined;
	discussionCommentId?: number | null | undefined;
	path?: string | null | undefined;
}): BatchCheckpointError {
	return {
		code: options.code,
		message: options.message,
		batch_id: options.batchId ?? null,
		thread_id: options.threadId ?? null,
		review_id: options.reviewId ?? null,
		discussion_comment_id: options.discussionCommentId ?? null,
		path: options.path ?? null,
	};
}

function nonThreadKeyError(code: string, message: string, key: NonThreadKey, batchId: string): BatchCheckpointError {
	return errorItem({ code, message, batchId, reviewId: key.sourceKind === "review" ? String(key.id) : null, discussionCommentId: key.sourceKind === "discussion_comment" ? Number(key.id) : null });
}

function nonThreadKeyId(key: NonThreadKey): string {
	return `${key.sourceKind}:${String(key.id)}`;
}

function parseNonThreadKeyId(value: string): NonThreadKey {
	const separatorIndex = value.indexOf(":");
	const sourceKind = value.slice(0, separatorIndex);
	const id = value.slice(separatorIndex + 1);
	if (sourceKind === "discussion_comment") return { sourceKind, id: Number(id) };
	return { sourceKind: "review", id };
}

function difference(left: ReadonlySet<string>, right: ReadonlySet<string>): string[] {
	return [...left].filter((value) => !right.has(value));
}

function trimOptional(value: string | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function trimRequired(value: string | null | undefined): string {
	return trimOptional(value) ?? "";
}
