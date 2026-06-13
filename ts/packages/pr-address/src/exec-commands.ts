import type { ExecOperation } from "./exec-operation.ts";

import { recordBatchCheckpointOperation } from "./batch-checkpoint.ts";
import { classificationTemplateOperation, planFeedbackOperation, validateFeedbackClassificationOperation } from "./classification-operations.ts";
import { getFeedbackOperation } from "./feedback-collection.ts";
import { finalizeRunOperation } from "./finalization.ts";
import { mapBranchPrsOperation } from "./map-branch-prs.ts";
import { replyToDiscussionOperation, replyToReviewOperation, resolveThreadBatchOperation, resolveThreadWithReplyOperation } from "./mutation-operations.ts";
import { prepareRunOperation } from "./prepare-run.ts";
import { readFeedbackDetailOperation, readFeedbackDetailsOperation } from "./read-feedback-detail.ts";
import { buildResolveThreadBatchPayloadOperation } from "./resolve-thread-batch-payload.ts";
import { stackFeedbackDiffCurrentOperation } from "./stack-feedback-diff-current.ts";
import { stackFeedbackPlanOperation } from "./stack-feedback-plan.ts";
import { stackFeedbackPreflightOperation } from "./stack-feedback-preflight.ts";
import { stackFeedbackPrepOperation } from "./stack-feedback-prep.ts";
import { buildStackResolveThreadPayloadsOperation } from "./stack-resolve-thread-payloads.ts";
import { summarizeFeedbackOperation } from "./summarize-feedback.ts";

/**
 * The single exec operation table, alphabetical so commander help matches
 * click's sorted command list. Every entry serves a pinned `--json-schema`
 * document; the table↔builder 1:1 contract is unit-tested.
 */
export const EXEC_OPERATIONS: readonly ExecOperation[] = [
	buildResolveThreadBatchPayloadOperation,
	buildStackResolveThreadPayloadsOperation,
	classificationTemplateOperation,
	finalizeRunOperation,
	getFeedbackOperation,
	mapBranchPrsOperation,
	planFeedbackOperation,
	prepareRunOperation,
	readFeedbackDetailOperation,
	readFeedbackDetailsOperation,
	recordBatchCheckpointOperation,
	replyToDiscussionOperation,
	replyToReviewOperation,
	resolveThreadBatchOperation,
	resolveThreadWithReplyOperation,
	stackFeedbackDiffCurrentOperation,
	stackFeedbackPlanOperation,
	stackFeedbackPreflightOperation,
	stackFeedbackPrepOperation,
	summarizeFeedbackOperation,
	validateFeedbackClassificationOperation,
];


