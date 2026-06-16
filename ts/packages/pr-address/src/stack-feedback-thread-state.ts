import { failure, ok, type ClinkrExit, type ClinkrFailureExit } from "@asdl/clinkr";
import { z } from "zod";

import { duplicateValues } from "./duplicate-values.ts";
import { defineExecOperation, gatewayFailureExit, gatewayOptions, type PrAddressExecContext } from "./exec-operation.ts";
import type { PRReviewThread, PrAddressGitHubGateway } from "./gateways.ts";
import { loadArtifactReference, type JsonInputResult } from "./json-input.ts";
import { tupleRepr, type PayloadArtifactStore, type PayloadReference } from "./payload-store.ts";
import { openPayloadStoreFromContext } from "./payload-store-context.ts";
import { stackArtifactDescriptor } from "./session-artifacts.ts";
import { compactOperationResult } from "./stdout-mode.ts";
import {
	stackFeedbackPrepInputSchema,
	type StackFeedbackPrInput,
} from "./stack-feedback-prep-contracts.ts";
import type {
	StackFeedbackThreadStatePrResult,
	StackFeedbackThreadStateResult,
	StackFeedbackThreadStateSummary,
	StackFeedbackThreadStateThread,
} from "./stack-feedback-thread-state-contracts.ts";

const stackFeedbackThreadStateParseSchema = z.object({
	stack_reference: z.string(),
	harness_session_id: z.string().optional(),
});

export const stackFeedbackThreadStateOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "stack-feedback-thread-state",
		description: "Fetch current stack review-thread state without reviews or discussion comments.",
		schema: stackFeedbackThreadStateParseSchema,
		handler: runStackFeedbackThreadStateOperation,
	},
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: ({ data, fullOutput }) => {
			const result = data as StackFeedbackThreadStateResult;
			const stackThreadStateReference = result.stack_thread_state_reference;
			if (stackThreadStateReference === null) {
				return { type: "error", errorType: "payload_lookup_failed", message: "stack-feedback-thread-state compact output requires a stack thread-state reference." };
			}
			const threadStateReference = stackThreadStateReference as PayloadReference;
			return {
				type: "ok",
				value: compactOperationResult({
					operation: "stack-feedback-thread-state",
					counts: { ...result.summary },
					artifacts: { full_output: fullOutput, produced: [{ kind: "stack-thread-state", reference: threadStateReference }] },
					details: compactThreadStateResult(result),
				}),
			};
		},
	},
});

async function runStackFeedbackThreadStateOperation(
	ctx: PrAddressExecContext,
	request: z.output<typeof stackFeedbackThreadStateParseSchema>,
): Promise<ClinkrExit<unknown>> {
	const storeResult = await openPayloadStoreFromContext({ ctx, harnessSessionId: request.harness_session_id });
	if (storeResult.type === "error") return failure(storeResult.errorType, storeResult.message);
	const store = storeResult.value;

	const payloadResult = await loadThreadStateStackInput({ stackReference: request.stack_reference, store });
	if (payloadResult.type === "error") return failure(payloadResult.error.errorType, payloadResult.error.message);

	const validationMessage = stackInputValidationMessage(payloadResult.value.stack);
	if (validationMessage !== null) return failure("invalid_request", validationMessage);

	const threadState = await prepareStackThreadState({ ctx, store, stack: payloadResult.value.stack, github: ctx.context.github });
	if (threadState.type === "error") return threadState.exit;

	return ok(threadState.value.result);
}

async function loadThreadStateStackInput(options: {
	stackReference: string;
	store: PayloadArtifactStore;
}): Promise<JsonInputResult<{ stack: StackFeedbackPrInput[] }>> {
	return await loadArtifactReference({
		filePath: options.stackReference,
		commandName: "stack-feedback-thread-state",
		optionName: "--stack-reference",
		artifactDescription: "a stack JSON payload",
		schema: stackFeedbackPrepInputSchema,
		store: options.store,
	});
}

async function prepareStackThreadState(options: {
	ctx: PrAddressExecContext;
	store: PayloadArtifactStore;
	stack: readonly StackFeedbackPrInput[];
	github: PrAddressGitHubGateway;
}): Promise<{ type: "ok"; value: { result: StackFeedbackThreadStateResult; stackThreadStateReference: PayloadReference } } | { type: "error"; exit: ClinkrFailureExit }> {
	const fetchResults = await Promise.all(
		options.stack.map((prInput) => fetchStackPrThreadState({ ctx: options.ctx, prInput, github: options.github })),
	);
	const prResults: StackFeedbackThreadStatePrResult[] = [];
	for (const fetchResult of fetchResults) {
		if (fetchResult.type === "error") return fetchResult;
		prResults.push(fetchResult.value);
	}

	const resultWithoutReference: StackFeedbackThreadStateResult = {
		harness_session_id: options.store.sessionId,
		include_resolved: true,
		stack: prResults,
		stack_thread_state_reference: null,
		summary: threadStateSummary(prResults),
	};
	const stackThreadStateReference = await options.store.writeJsonArtifact({
		descriptor: stackArtifactDescriptor("thread-state"),
		role: "summary",
		payload: resultWithoutReference,
	});
	if (stackThreadStateReference.type === "error") return { type: "error", exit: failure(stackThreadStateReference.errorType, stackThreadStateReference.message) };
	return {
		type: "ok",
		value: {
			result: { ...resultWithoutReference, stack_thread_state_reference: stackThreadStateReference.value },
			stackThreadStateReference: stackThreadStateReference.value,
		},
	};
}

async function fetchStackPrThreadState(options: {
	ctx: PrAddressExecContext;
	prInput: StackFeedbackPrInput;
	github: PrAddressGitHubGateway;
}): Promise<{ type: "ok"; value: StackFeedbackThreadStatePrResult } | { type: "error"; exit: ClinkrFailureExit }> {
	const threadsResult = await options.github.getReviewThreads(options.prInput.pr_number, { ...gatewayOptions(options.ctx), shouldIncludeResolved: true });
	if (threadsResult.type === "failure") return { type: "error", exit: gatewayFailureExit(`Failed to fetch review threads for PR ${options.prInput.pr_number}`, threadsResult.failure) };
	return { type: "ok", value: threadStatePrResult(options.prInput, threadsResult.value) };
}

function threadStatePrResult(prInput: StackFeedbackPrInput, threads: readonly PRReviewThread[]): StackFeedbackThreadStatePrResult {
	const reviewThreads = threads.map(threadStateThread);
	return {
		pr_number: prInput.pr_number,
		branch: prInput.branch,
		title: prInput.title,
		url: prInput.url,
		head_ref_name: prInput.head_ref_name,
		base_ref_name: prInput.base_ref_name,
		review_threads: reviewThreads,
		counts: {
			review_threads: reviewThreads.length,
			unresolved_review_threads: reviewThreads.filter((thread) => !thread.is_resolved).length,
			resolved_review_threads: reviewThreads.filter((thread) => thread.is_resolved).length,
		},
	};
}

function threadStateThread(thread: PRReviewThread): StackFeedbackThreadStateThread {
	return {
		thread_id: thread.id,
		path: thread.path,
		line: thread.line,
		start_line: thread.start_line,
		is_resolved: thread.is_resolved,
		is_outdated: thread.is_outdated,
		comment_count: thread.comments.length,
	};
}

function threadStateSummary(prResults: readonly StackFeedbackThreadStatePrResult[]): StackFeedbackThreadStateSummary {
	return {
		prs: prResults.length,
		review_threads: prResults.reduce((total, item) => total + item.counts.review_threads, 0),
		unresolved_review_threads: prResults.reduce((total, item) => total + item.counts.unresolved_review_threads, 0),
		resolved_review_threads: prResults.reduce((total, item) => total + item.counts.resolved_review_threads, 0),
	};
}

function compactThreadStateResult(result: StackFeedbackThreadStateResult): Record<string, unknown> {
	return {
		harness_session_id: result.harness_session_id,
		include_resolved: true,
		summary: result.summary,
		stack_thread_state_reference: result.stack_thread_state_reference,
		stack: result.stack.map((prResult) => ({
			pr_number: prResult.pr_number,
			branch: prResult.branch,
			title: prResult.title,
			url: prResult.url,
			head_ref_name: prResult.head_ref_name,
			base_ref_name: prResult.base_ref_name,
			counts: prResult.counts,
		})),
	};
}

function stackInputValidationMessage(stack: readonly StackFeedbackPrInput[]): string | null {
	if (stack.length === 0) return "stack-feedback-thread-state requires at least one stack PR.";
	const duplicatePrs = duplicateValues(stack.map((item) => item.pr_number));
	if (duplicatePrs.length > 0) return `stack-feedback-thread-state stack contains duplicate PR numbers: ${tupleRepr(duplicatePrs)}`;
	if (!stack.every((item) => item.branch.trim() !== "")) return "stack-feedback-thread-state requires every stack PR branch to be non-empty.";
	const duplicateBranches = duplicateValues(stack.map((item) => item.branch));
	if (duplicateBranches.length > 0) return `stack-feedback-thread-state stack contains duplicate branches: ${tupleRepr(duplicateBranches)}`;
	return null;
}
