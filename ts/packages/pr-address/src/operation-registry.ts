import type { PrAddressContext } from "./context.ts";
import { runRecordBatchCheckpointOperation } from "./batch-checkpoint.ts";
import { runClassificationTemplateOperation, runPlanFeedbackOperation, runValidateFeedbackClassificationOperation } from "./classification-core.ts";
import type { ClinkrExit } from "./clinkr-envelope.ts";
import { runGetDiscussionCommentsOperation, runGetFeedbackOperation, runGetPrForBranchOperation, runGetReviewCommentsOperation, runGetReviewsOperation } from "./feedback-collection.ts";
import { runFinalizeRunOperation } from "./finalization.ts";
import {
	runAddIssueCommentOperation,
	runAddReactionOperation,
	runAddReviewThreadReplyOperation,
	runReplyToDiscussionOperation,
	runReplyToReviewOperation,
	runResolveThreadBatchOperation,
	runResolveThreadOperation,
	runResolveThreadWithReplyOperation,
	runUnresolveThreadOperation,
} from "./mutation-operations.ts";
import { runPrepareRunOperation } from "./prepare-run.ts";
import { runReadFeedbackDetailOperation, runReadFeedbackDetailsOperation } from "./read-feedback-detail.ts";
import { runBuildResolveThreadBatchPayloadOperation } from "./resolve-thread-batch-payload.ts";
import { runStackFeedbackDiffCurrentOperation } from "./stack-feedback-diff-current.ts";
import { runStackFeedbackPlanOperation, runStackFeedbackPrepOperation } from "./stack-feedback.ts";
import { runBuildStackResolveThreadPayloadsOperation } from "./stack-resolve-thread-payloads.ts";
import { runSummarizeFeedbackOperation } from "./summarize-feedback.ts";

export interface ExecRuntimeDeps {
	context: PrAddressContext;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: () => Promise<string>;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

export interface ExecOperationInvocation {
	operation: string;
	args: readonly string[];
	deps: ExecRuntimeDeps;
}

export type ExecOperationDispatchResult =
	| { type: "exit"; exit: ClinkrExit }
	| { type: "raw-exit"; exitCode: number };

export type ExecOperationHandler = (invocation: ExecOperationInvocation) => Promise<ExecOperationDispatchResult>;

export interface ExecOperationDefinition {
	name: string;
	handler: ExecOperationHandler;
}

export interface ExecOperationRegistry {
	get(operation: string): ExecOperationDefinition | undefined;
	names(): readonly string[];
}

export function createDefaultExecOperationRegistry(): ExecOperationRegistry {
	return createExecOperationRegistry([
		{
			name: "add-issue-comment",
			handler: runAddIssueCommentOperation,
		},
		{
			name: "add-reaction",
			handler: runAddReactionOperation,
		},
		{
			name: "add-review-thread-reply",
			handler: runAddReviewThreadReplyOperation,
		},
		{
			name: "reply-to-discussion",
			handler: runReplyToDiscussionOperation,
		},
		{
			name: "reply-to-review",
			handler: runReplyToReviewOperation,
		},
		{
			name: "resolve-thread",
			handler: runResolveThreadOperation,
		},
		{
			name: "resolve-thread-batch",
			handler: runResolveThreadBatchOperation,
		},
		{
			name: "resolve-thread-with-reply",
			handler: runResolveThreadWithReplyOperation,
		},
		{
			name: "unresolve-thread",
			handler: runUnresolveThreadOperation,
		},
		{
			name: "classification-template",
			handler: runClassificationTemplateOperation,
		},
		{
			name: "validate-feedback-classification",
			handler: runValidateFeedbackClassificationOperation,
		},
		{
			name: "plan-feedback",
			handler: runPlanFeedbackOperation,
		},
		{
			name: "build-resolve-thread-batch-payload",
			handler: runBuildResolveThreadBatchPayloadOperation,
		},
		{
			name: "get-pr-for-branch",
			handler: runGetPrForBranchOperation,
		},
		{
			name: "get-reviews",
			handler: runGetReviewsOperation,
		},
		{
			name: "get-review-comments",
			handler: runGetReviewCommentsOperation,
		},
		{
			name: "get-discussion-comments",
			handler: runGetDiscussionCommentsOperation,
		},
		{
			name: "get-feedback",
			handler: runGetFeedbackOperation,
		},
		{
			name: "prepare-run",
			handler: runPrepareRunOperation,
		},
		{
			name: "summarize-feedback",
			handler: runSummarizeFeedbackOperation,
		},
		{
			name: "read-feedback-detail",
			handler: runReadFeedbackDetailOperation,
		},
		{
			name: "read-feedback-details",
			handler: runReadFeedbackDetailsOperation,
		},
		{
			name: "record-batch-checkpoint",
			handler: runRecordBatchCheckpointOperation,
		},
		{
			name: "stack-feedback-diff-current",
			handler: runStackFeedbackDiffCurrentOperation,
		},
		{
			name: "stack-feedback-prep",
			handler: runStackFeedbackPrepOperation,
		},
		{
			name: "stack-feedback-plan",
			handler: runStackFeedbackPlanOperation,
		},
		{
			name: "build-stack-resolve-thread-payloads",
			handler: runBuildStackResolveThreadPayloadsOperation,
		},
		{
			name: "finalize-run",
			handler: runFinalizeRunOperation,
		},
	]);
}

export function createExecOperationRegistry(definitions: readonly ExecOperationDefinition[]): ExecOperationRegistry {
	const byName = new Map<string, ExecOperationDefinition>();
	for (const definition of definitions) byName.set(definition.name, definition);
	const sortedNames = [...byName.keys()].sort();
	return {
		get(operation: string): ExecOperationDefinition | undefined {
			return byName.get(operation);
		},
		names(): readonly string[] {
			return sortedNames;
		},
	};
}

