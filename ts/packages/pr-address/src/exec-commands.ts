import type { ExecOperation } from "./exec-operation.ts";

import { recordBatchCheckpointOperation } from "./batch-checkpoint.ts";
import { classificationTemplateOperation, planFeedbackOperation, validateFeedbackClassificationOperation } from "./classification-operations.ts";
import { downloadFeedbackOperation } from "./download-feedback.ts";
import { getFeedbackOperation } from "./feedback-collection.ts";
import { finalizeRunOperation } from "./finalization.ts";
import { mapBranchPrsOperation } from "./map-branch-prs.ts";
import { replyToDiscussionOperation, replyToReviewOperation, resolveThreadBatchOperation, resolveThreadWithReplyOperation } from "./mutation-operations.ts";
import { prepareRunOperation } from "./prepare-run.ts";
import { readFeedbackDetailOperation, readFeedbackDetailsOperation } from "./read-feedback-detail.ts";
import { buildResolveThreadBatchPayloadOperation } from "./resolve-thread-batch-payload.ts";

/**
 * The single exec operation table, alphabetical so commander help matches
 * click's sorted command list. Every entry serves a pinned `--json-schema`
 * document; the table↔builder 1:1 contract is unit-tested.
 */
export const EXEC_OPERATIONS: readonly ExecOperation[] = [
	buildResolveThreadBatchPayloadOperation,
	classificationTemplateOperation,
	downloadFeedbackOperation,
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
	validateFeedbackClassificationOperation,
];


