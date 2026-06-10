import type { PrAddressContext } from "./context.ts";
import { runRecordBatchCheckpointOperation } from "./batch-checkpoint.ts";
import { runClassificationTemplateOperation, runPlanFeedbackOperation, runValidateFeedbackClassificationOperation } from "./classification-core.ts";
import type { ClinkrExit } from "./clinkr-envelope.ts";
import { runGetFeedbackOperation } from "./feedback-collection.ts";
import { runMapBranchPrsOperation } from "./map-branch-prs.ts";
import { runFinalizeRunOperation } from "./finalization.ts";
import {
	runReplyToDiscussionOperation,
	runReplyToReviewOperation,
	runResolveThreadBatchOperation,
	runResolveThreadWithReplyOperation,
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
	| { type: "fallback" }
	| { type: "exit"; exit: ClinkrExit }
	| { type: "raw-exit"; exitCode: number };

export type ExecOperationHandler = (invocation: ExecOperationInvocation) => Promise<ExecOperationDispatchResult>;

export interface ExecOperationDefinition {
	name: string;
	handler: ExecOperationHandler;
	/**
	 * Operation calls GitHub through `gh`, which resolves `owner/repo` from the
	 * cwd's git remotes. The CLI fails fast with `repo_context_required` when
	 * such an operation runs outside a git work tree.
	 */
	isRepoContextRequired?: boolean | undefined;
}

export interface ExecOperationRegistry {
	get(operation: string): ExecOperationDefinition | undefined;
	isTsManaged(operation: string): boolean;
}

export const LEGACY_EXEC_OPERATIONS: readonly string[] = [
	"build-resolve-thread-batch-payload",
	"build-stack-resolve-thread-payloads",
	"classification-template",
	"finalize-run",
	"get-feedback",
	"plan-feedback",
	"prepare-run",
	"read-feedback-detail",
	"read-feedback-details",
	"record-batch-checkpoint",
	"reply-to-discussion",
	"reply-to-review",
	"resolve-thread-batch",
	"resolve-thread-with-reply",
	"stack-feedback-diff-current",
	"stack-feedback-plan",
	"stack-feedback-prep",
	"summarize-feedback",
	"validate-feedback-classification",
];

export function createDefaultExecOperationRegistry(): ExecOperationRegistry {
	return createExecOperationRegistry([
		{
			name: "reply-to-discussion",
			handler: runReplyToDiscussionOperation,
			isRepoContextRequired: true,
		},
		{
			name: "reply-to-review",
			handler: runReplyToReviewOperation,
			isRepoContextRequired: true,
		},
		{
			name: "resolve-thread-batch",
			handler: runResolveThreadBatchOperation,
			isRepoContextRequired: true,
		},
		{
			name: "resolve-thread-with-reply",
			handler: runResolveThreadWithReplyOperation,
			isRepoContextRequired: true,
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
			name: "get-feedback",
			handler: runGetFeedbackOperation,
			isRepoContextRequired: true,
		},
		{
			name: "map-branch-prs",
			handler: runMapBranchPrsOperation,
			isRepoContextRequired: true,
		},
		{
			name: "prepare-run",
			handler: runPrepareRunOperation,
			isRepoContextRequired: true,
		},
		{
			name: "summarize-feedback",
			handler: runSummarizeFeedbackOperation,
			isRepoContextRequired: true,
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
			isRepoContextRequired: true,
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
	return {
		get(operation: string): ExecOperationDefinition | undefined {
			return byName.get(operation);
		},
		isTsManaged(operation: string): boolean {
			return byName.has(operation);
		},
	};
}

