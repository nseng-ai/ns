import type { PrAddressContext } from "./context.ts";
import { runClassificationTemplateOperation, runPlanFeedbackOperation, runValidateFeedbackClassificationOperation } from "./classification-core.ts";
import type { ClinkrExit } from "./clinkr-envelope.ts";
import { runGetDiscussionCommentsOperation, runGetFeedbackOperation, runGetPrForBranchOperation, runGetReviewCommentsOperation, runGetReviewsOperation } from "./feedback-collection.ts";
import { runFinalizeRunOperation } from "./finalization.ts";
import { runReadFeedbackDetailOperation } from "./read-feedback-detail.ts";
import { runBuildResolveThreadBatchPayloadOperation } from "./resolve-thread-batch-payload.ts";
import { runStackFeedbackDiffCurrentOperation } from "./stack-feedback-diff-current.ts";

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
}

export interface ExecOperationRegistry {
	get(operation: string): ExecOperationDefinition | undefined;
	isTsManaged(operation: string): boolean;
}

export const LEGACY_EXEC_OPERATIONS: readonly string[] = [
	"add-issue-comment",
	"add-reaction",
	"add-review-thread-reply",
	"build-resolve-thread-batch-payload",
	"build-stack-resolve-thread-payloads",
	"classification-template",
	"finalize-run",
	"get-discussion-comments",
	"get-feedback",
	"get-pr-for-branch",
	"get-review-comments",
	"get-reviews",
	"plan-feedback",
	"prepare-run",
	"read-feedback-detail",
	"read-feedback-details",
	"record-batch-checkpoint",
	"reply-to-discussion",
	"reply-to-review",
	"resolve-thread",
	"resolve-thread-batch",
	"resolve-thread-with-reply",
	"stack-feedback-diff-current",
	"stack-feedback-plan",
	"stack-feedback-prep",
	"summarize-feedback",
	"unresolve-thread",
	"validate-feedback-classification",
];

export function createDefaultExecOperationRegistry(): ExecOperationRegistry {
	return createExecOperationRegistry([
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
			name: "read-feedback-detail",
			handler: runReadFeedbackDetailOperation,
		},
		{
			name: "stack-feedback-diff-current",
			handler: runStackFeedbackDiffCurrentOperation,
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

