import { z } from "zod";

import {
	buildClassificationTemplateSchemaDocument,
	buildPlanFeedbackSchemaDocument,
	buildValidateFeedbackClassificationSchemaDocument,
	type JsonSchemaDocument,
} from "./classification-schemas.ts";
import { ACTION_COMPLEXITIES, INFORMATIONAL_REASONS } from "./feedback-plan-contracts.ts";

// TypeScript-owned `--json-schema` documents for every pr-address exec operation.
//
// These schemas mirror the legacy Python (Pydantic) request/result contracts at the
// structural-semantic level: property sets, required-ness, types, enums, and explicit
// nullability match the Python documents, while dialect details (titles, `$defs`
// naming, integer bounds) may differ. Parity is enforced against captured Python
// fixtures in `test/scenario/json-schema-routes.test.ts`.
//
// Conventions:
// - Pydantic `ClinkrModel` / `BaseModel(extra="forbid")` mirrors use `z.object`
//   (emits `additionalProperties: false`).
// - Pydantic dataclass mirrors (gh/git types) use `z.looseObject` (open objects).
// - Fields with Python defaults use `.optional()`; explicit-null fields use `.nullable()`.

const nullableStringSchema = z.string().nullable();
const nullableIntSchema = z.int().nullable();
const nullableBooleanSchema = z.boolean().nullable();

// --- shared enums -----------------------------------------------------------

const prReviewStateSchema = z.enum(["PENDING", "COMMENTED", "APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);
const prStateSchema = z.enum(["OPEN", "CLOSED", "MERGED"]);
const resolutionReplyModeSchema = z.enum(["fixed", "pre_existing", "explained", "planned"]);
const detailKindSchema = z.enum([
	"review",
	"review_body",
	"review_thread",
	"thread_comment",
	"thread_comment_body",
	"discussion_comment",
	"discussion_comment_body",
]);
const manifestKindSchema = z.enum(["get_feedback", "prepare_run"]);
const actionComplexityDocSchema = z.enum(ACTION_COMPLEXITIES);
const informationalReasonDocSchema = z.enum(INFORMATIONAL_REASONS);
const validationErrorCodeSchema = z.enum([
	"invalid_schema",
	"missing_review",
	"duplicate_review",
	"unknown_review",
	"missing_thread",
	"duplicate_thread",
	"unknown_thread",
	"resolved_thread_classified",
	"missing_thread_comment",
	"duplicate_thread_comment",
	"unknown_thread_comment",
	"missing_discussion_comment",
	"duplicate_discussion_comment",
	"unknown_discussion_comment",
	"invalid_locator",
	"invalid_action_fields",
	"invalid_informational_fields",
]);
const validationItemKindSchema = z.enum(["review", "review_thread", "thread_comment", "discussion_comment", "packet"]);
const planSourceKindDocSchema = z.enum(["review", "review_thread", "discussion_comment"]);
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

// --- GitHub / git dataclass mirrors (open objects) ---------------------------

const prReviewSchema = z.looseObject({
	id: z.string(),
	author: z.string(),
	body: z.string(),
	state: prReviewStateSchema,
	submitted_at: z.string(),
});

const prReviewCommentSchema = z.looseObject({
	id: z.int(),
	body: z.string(),
	author: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	created_at: z.string(),
	start_line: nullableIntSchema.optional(),
});

const prReviewThreadSchema = z.looseObject({
	id: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	is_resolved: z.boolean(),
	is_outdated: z.boolean(),
	comments: z.array(prReviewCommentSchema),
	start_line: nullableIntSchema.optional(),
});

const prDiscussionCommentSchema = z.looseObject({
	id: z.int(),
	body: z.string(),
	author: z.string(),
	url: z.string(),
});

const reactionSchema = z.looseObject({
	id: z.int(),
	comment_id: z.int(),
	content: z.string(),
});

const restructuredFileSchema = z.looseObject({
	status: z.string(),
	old_path: z.string(),
	new_path: z.string(),
	similarity: z.int(),
});

// --- payload store reference -------------------------------------------------

const payloadReferenceSchema = z.object({
	payload_path: z.string(),
	session_id: z.string(),
	descriptor: z.string(),
	role: z.enum(["raw", "summary", "log"]),
	created_at_utc: z.string(),
	sequence: z.int(),
	payload_bytes: z.int(),
	content_type: z.string(),
	extension: z.enum(["json", "txt"]),
});

// --- feedback payload manifest contracts -------------------------------------

const feedbackDomainLocatorSchema = z.object({
	kind: z.enum(["review", "review_thread_comment", "discussion_comment"]),
	review_id: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	comment_id: nullableIntSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	comment_index: nullableIntSchema.optional(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	is_resolved: nullableBooleanSchema.optional(),
	is_outdated: nullableBooleanSchema.optional(),
	author: nullableStringSchema.optional(),
});

const bodyLocatorSchema = z.object({
	body_chars: z.int(),
	json_pointer: z.string(),
	item_pointer: nullableStringSchema.optional(),
	domain: feedbackDomainLocatorSchema,
});

const feedbackCountsSchema = z.object({
	reviews: z.int(),
	review_threads: z.int(),
	unresolved_review_threads: z.int(),
	resolved_review_threads: z.int(),
	thread_comments: z.int(),
	discussion_comments: z.int(),
});

const reviewManifestItemSchema = z.object({
	id: z.string(),
	author: z.string(),
	state: prReviewStateSchema,
	submitted_at: z.string(),
	body_locator: bodyLocatorSchema,
});

const threadCommentManifestItemSchema = z.object({
	id: z.int(),
	author: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	start_line: nullableIntSchema,
	created_at: z.string(),
	body_locator: bodyLocatorSchema,
});

const threadManifestItemSchema = z.object({
	thread_id: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	start_line: nullableIntSchema,
	is_resolved: z.boolean(),
	is_outdated: z.boolean(),
	comment_count: z.int(),
	item_pointer: z.string(),
	comments: z.array(threadCommentManifestItemSchema),
});

const discussionCommentManifestItemSchema = z.object({
	comment_id: z.int(),
	author: z.string(),
	url: z.string(),
	body_locator: bodyLocatorSchema,
});

const getFeedbackPayloadManifestSchema = z.object({
	payload_mode: z.literal("payload").optional(),
	payload_reference: payloadReferenceSchema,
	pr_number: z.int(),
	counts: feedbackCountsSchema,
	reviews: z.array(reviewManifestItemSchema),
	review_threads: z.array(threadManifestItemSchema),
	discussion_comments: z.array(discussionCommentManifestItemSchema),
});

const getFeedbackInlineResultSchema = z.object({
	payload_mode: z.literal("inline").optional(),
	pr_number: z.int(),
	reviews: z.array(prReviewSchema),
	review_threads: z.array(prReviewThreadSchema),
	discussion_comments: z.array(prDiscussionCommentSchema),
});

const prepareRunPayloadManifestSchema = z.object({
	payload_mode: z.literal("payload").optional(),
	payload_reference: payloadReferenceSchema,
	found: z.boolean(),
	current_branch: nullableStringSchema.optional(),
	number: nullableIntSchema.optional(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	head_ref_name: nullableStringSchema.optional(),
	base_ref_name: nullableStringSchema.optional(),
	state: prStateSchema.nullable().optional(),
	counts: feedbackCountsSchema.nullable().optional(),
	reviews: z.array(reviewManifestItemSchema).optional(),
	review_threads: z.array(threadManifestItemSchema).optional(),
	discussion_comments: z.array(discussionCommentManifestItemSchema).optional(),
	reopened_thread_ids: z.array(z.string()).optional(),
	restructured_files: z.array(restructuredFileSchema).optional(),
	warnings: z.array(z.string()).optional(),
	error: nullableStringSchema.optional(),
	returncode: nullableIntSchema.optional(),
});

const prepareRunInlineResultSchema = z.object({
	payload_mode: z.literal("inline").optional(),
	found: z.boolean(),
	current_branch: nullableStringSchema.optional(),
	number: nullableIntSchema.optional(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	head_ref_name: nullableStringSchema.optional(),
	base_ref_name: nullableStringSchema.optional(),
	state: prStateSchema.nullable().optional(),
	reviews: z.array(prReviewSchema).optional(),
	review_threads: z.array(prReviewThreadSchema).optional(),
	discussion_comments: z.array(prDiscussionCommentSchema).optional(),
	reopened_thread_ids: z.array(z.string()).optional(),
	restructured_files: z.array(restructuredFileSchema).optional(),
	warnings: z.array(z.string()).optional(),
	error: nullableStringSchema.optional(),
	returncode: nullableIntSchema.optional(),
});

// --- resolution provenance ----------------------------------------------------

const localBranchResolutionProvenanceSchema = z.object({
	kind: z.literal("local_branch"),
	branch: z.string(),
	branch_head_oid: z.string(),
});

const prResolutionProvenanceSchema = z.object({
	kind: z.literal("pr"),
	pr_number: z.int(),
	pr_url: z.string(),
	pr_state: z.string(),
	pr_head_ref_name: z.string(),
	pr_head_ref_oid: nullableStringSchema.optional(),
});

const resolutionProvenanceSchema = z.discriminatedUnion("kind", [localBranchResolutionProvenanceSchema, prResolutionProvenanceSchema]);

const localBranchResolutionProvenanceInputSchema = z.object({
	kind: z.literal("local_branch"),
	branch: z.string(),
});

const prResolutionProvenanceInputSchema = z.object({
	kind: z.literal("pr"),
	pr_number: z.int(),
});

const resolutionProvenanceInputSchema = z.discriminatedUnion("kind", [
	localBranchResolutionProvenanceInputSchema,
	prResolutionProvenanceInputSchema,
]);

// --- shared request shapes ----------------------------------------------------

const payloadJsonOrFileRequestSchema = z.object({
	payload_json: nullableStringSchema.optional(),
	payload_file: nullableStringSchema.optional(),
});

const stackFeedbackDiffCurrentRequestSchema = payloadJsonOrFileRequestSchema.extend({
	stack_plan_reference: nullableStringSchema.optional(),
	current_prep_reference: nullableStringSchema.optional(),
});

const buildStackResolveThreadPayloadsRequestSchema = payloadJsonOrFileRequestSchema.extend({
	stack_plan_reference: nullableStringSchema.optional(),
});

// --- mutation operations --------------------------------------------------------

const replyToDiscussionRequestSchema = z.object({
	pr_number: z.int(),
	comment_id: z.int(),
	comment_author: z.string(),
	original_body: z.string(),
	response: z.string(),
});

const replyToDiscussionResultSchema = z.object({
	body: z.string(),
	comment: prDiscussionCommentSchema,
	reaction_added: z.boolean(),
	reaction: reactionSchema.nullable().optional(),
	warning: nullableStringSchema.optional(),
});

const replyToReviewRequestSchema = z.object({
	pr_number: z.int(),
	review_author: z.string(),
	summary_markdown: z.string(),
});

const replyToReviewResultSchema = z.object({
	body: z.string(),
	comment: prDiscussionCommentSchema,
});

const resolveThreadWithReplyRequestSchema = z.object({
	thread_id: z.string(),
	mode: resolutionReplyModeSchema,
	message: nullableStringSchema,
	commit_sha: nullableStringSchema,
	provenance_json: nullableStringSchema.optional(),
});

const resolveThreadWithReplyResultSchema = z.object({
	thread_id: z.string(),
	body: z.string(),
	comment: prReviewCommentSchema,
	is_resolved: z.boolean(),
	provenance: resolutionProvenanceSchema.nullable().optional(),
});

const resolveThreadBatchItemResultSchema = z.object({
	index: z.int(),
	thread_id: z.string(),
	mode: resolutionReplyModeSchema,
	status: z.enum(["resolved", "failed", "skipped"]),
	body: nullableStringSchema.optional(),
	comment: prReviewCommentSchema.nullable().optional(),
	is_resolved: nullableBooleanSchema.optional(),
	error_type: nullableStringSchema.optional(),
	error_message: nullableStringSchema.optional(),
	provenance: resolutionProvenanceSchema.nullable().optional(),
});

const resolveThreadBatchResultSchema = z.object({
	total: z.int(),
	resolved: z.int(),
	failed: z.int(),
	skipped: z.int(),
	all_succeeded: z.boolean(),
	results: z.array(resolveThreadBatchItemResultSchema),
});

// --- read-only collection operations -------------------------------------------

const getFeedbackRequestSchema = z.object({
	pr_number: z.int(),
	include_resolved: z.boolean().optional(),
	include_empty_reviews: z.boolean().optional(),
	payload_mode: z.enum(["inline", "payload"]).optional(),
	payload_session_id: nullableStringSchema.optional(),
});

const getFeedbackResultSchema = z.union([getFeedbackInlineResultSchema, getFeedbackPayloadManifestSchema]);

const prepareRunRequestSchema = z.object({
	include_all_threads: z.boolean().optional(),
	include_empty_reviews: z.boolean().optional(),
	payload_mode: z.enum(["inline", "payload"]).optional(),
	payload_session_id: nullableStringSchema.optional(),
});

const prepareRunResultSchema = z.union([prepareRunInlineResultSchema, prepareRunPayloadManifestSchema]);

// --- summarize-feedback ----------------------------------------------------------

const summarizeFeedbackRequestSchema = z.object({
	pr_number: z.int(),
	include_resolved: z.boolean().optional(),
	include_empty_reviews: z.boolean().optional(),
	body_chars: z.int().optional(),
});

const compactPullRequestSummarySchema = z.object({
	number: z.int(),
	title: z.string(),
	url: z.string(),
	head_ref_name: z.string(),
	base_ref_name: z.string(),
	state: prStateSchema,
});

const feedbackSummaryCountsSchema = z.object({
	reviews: z.int(),
	review_threads: z.int(),
	unresolved_review_threads: z.int(),
	resolved_review_threads: z.int(),
	discussion_comments: z.int(),
});

const compactReviewSummarySchema = z.object({
	id: z.string(),
	author: z.string(),
	state: z.string(),
	submitted_at: z.string(),
	body_first_line_excerpt: nullableStringSchema,
	body_excerpt: z.string(),
});

const compactThreadCommentSummarySchema = z.object({
	id: z.int(),
	author: z.string(),
	line: nullableIntSchema,
	start_line: nullableIntSchema,
	created_at: z.string(),
	body_first_line_excerpt: nullableStringSchema,
	body_excerpt: z.string(),
});

const compactThreadSummarySchema = z.object({
	thread_id: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	start_line: nullableIntSchema,
	is_outdated: z.boolean(),
	is_resolved: z.boolean(),
	comment_count: z.int(),
	first_comment: compactThreadCommentSummarySchema.nullable(),
});

const compactDiscussionCommentSummarySchema = z.object({
	comment_id: z.int(),
	author: z.string(),
	url: z.string(),
	source_kind: z.enum(["automation_like", "human_like"]),
	source_evidence: z.array(z.string()),
	body_first_line_excerpt: nullableStringSchema,
	body_excerpt: z.string(),
});

const summarizeFeedbackResultSchema = z.object({
	found: z.boolean(),
	pr_number: z.int(),
	pr: compactPullRequestSummarySchema.nullable().optional(),
	counts: feedbackSummaryCountsSchema.nullable().optional(),
	reviews: z.array(compactReviewSummarySchema).optional(),
	review_threads: z.array(compactThreadSummarySchema).optional(),
	discussion_comments: z.array(compactDiscussionCommentSummarySchema).optional(),
	error: nullableStringSchema.optional(),
	returncode: nullableIntSchema.optional(),
});

// --- read-feedback-detail ----------------------------------------------------------

const readFeedbackDetailRequestSchema = z.object({
	payload_path: z.string(),
	json_pointer: z.string(),
});

const readFeedbackDetailResultSchema = z.object({
	payload_path: z.string(),
	json_pointer: z.string(),
	detail_kind: detailKindSchema,
	value: z.unknown(),
});

const readFeedbackDetailsRequestSchema = z.object({
	selection_json: nullableStringSchema.optional(),
});

const selectedFeedbackDetailSummarySchema = z.object({
	json_pointer: z.string(),
	detail_kind: detailKindSchema,
	artifact_json_pointer: z.string(),
	value_kind: z.enum(["string", "object"]),
	value_chars: nullableIntSchema.optional(),
	body_chars: nullableIntSchema.optional(),
	object_keys: z.array(z.string()).nullable().optional(),
});

const selectedFeedbackDetailCountsSchema = z.object({
	requested: z.int(),
	selected: z.int(),
	body_values: z.int(),
	item_values: z.int(),
});

const readFeedbackDetailsResultSchema = z.object({
	payload_path: z.string(),
	selected_payload_reference: payloadReferenceSchema,
	details: z.array(selectedFeedbackDetailSummarySchema),
	counts: selectedFeedbackDetailCountsSchema,
});

// --- build-resolve-thread-batch-payload ----------------------------------------------

const buildResolveThreadBatchPayloadErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	batch_id: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
});

const ignoredNonThreadItemSchema = z.object({
	source_kind: z.string(),
	review_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	summary: z.string(),
});

const skippedResolveThreadItemSchema = z.object({
	thread_id: z.string(),
	skip_reason: z.string(),
	summary: z.string(),
});

const resolveThreadBatchPayloadItemSchema = z.object({
	thread_id: z.string(),
	mode: resolutionReplyModeSchema,
	message: nullableStringSchema.optional(),
	commit_sha: nullableStringSchema.optional(),
	provenance: resolutionProvenanceInputSchema.nullable().optional(),
});

const resolveThreadBatchPayloadSchema = z.object({
	commit_sha: nullableStringSchema.optional(),
	continue_on_error: z.boolean().optional(),
	items: z.array(resolveThreadBatchPayloadItemSchema),
});

const buildResolveThreadBatchPayloadResultSchema = z.object({
	valid: z.boolean(),
	payload_ready: z.boolean(),
	batch_id: z.string(),
	commit_sha: nullableStringSchema.optional(),
	continue_on_error: z.boolean().optional(),
	review_thread_count: z.int(),
	resolved_thread_count: z.int(),
	skipped_thread_count: z.int(),
	ignored_non_thread_items: z.array(ignoredNonThreadItemSchema).optional(),
	skipped_items: z.array(skippedResolveThreadItemSchema).optional(),
	payload: resolveThreadBatchPayloadSchema.nullable().optional(),
	errors: z.array(buildResolveThreadBatchPayloadErrorSchema).optional(),
	warnings: z.array(z.string()).optional(),
});

// --- build-stack-resolve-thread-payloads ----------------------------------------------

const buildStackResolveThreadPayloadsErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	batch_id: nullableStringSchema.optional(),
	pr_number: nullableIntSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	actual_pr_number: nullableIntSchema.optional(),
	actual_batch_id: nullableStringSchema.optional(),
});

const stackIgnoredNonThreadItemSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	source_kind: z.string(),
	review_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	summary: z.string(),
});

const stackSkippedResolveThreadItemSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	thread_id: z.string(),
	skip_reason: z.string(),
	summary: z.string(),
});

const stackResolveThreadPayloadEntrySchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	batch_id: z.string(),
	source_batch_id: nullableStringSchema.optional(),
	payload_ready: z.boolean(),
	review_thread_count: z.int(),
	resolved_thread_count: z.int(),
	skipped_thread_count: z.int(),
	ignored_non_thread_items: z.array(stackIgnoredNonThreadItemSchema).optional(),
	skipped_items: z.array(stackSkippedResolveThreadItemSchema).optional(),
	payload: resolveThreadBatchPayloadSchema.nullable().optional(),
	warnings: z.array(z.string()).optional(),
});

const buildStackResolveThreadPayloadsResultSchema = z.object({
	valid: z.boolean(),
	payloads_ready: z.boolean(),
	batch_id: z.string(),
	commit_sha: nullableStringSchema.optional(),
	continue_on_error: z.boolean().optional(),
	review_thread_count: z.int(),
	resolved_thread_count: z.int(),
	skipped_thread_count: z.int(),
	ignored_non_thread_items: z.array(stackIgnoredNonThreadItemSchema).optional(),
	skipped_items: z.array(stackSkippedResolveThreadItemSchema).optional(),
	payloads: z.array(stackResolveThreadPayloadEntrySchema).optional(),
	errors: z.array(buildStackResolveThreadPayloadsErrorSchema).optional(),
	warnings: z.array(z.string()).optional(),
});

// --- classification validation / template contracts -----------------------------------

const feedbackClassificationValidationErrorSchema = z.object({
	code: validationErrorCodeSchema,
	message: z.string(),
	kind: validationItemKindSchema,
	identifier: z.union([z.string(), z.int()]).nullable().optional(),
	path: nullableStringSchema.optional(),
});

const classificationBodyLocatorRefSchema = z.object({
	json_pointer: z.string(),
	item_pointer: nullableStringSchema.optional(),
});

const classificationTemplateReviewItemSchema = z.object({
	review_id: z.string(),
	disposition: z.string().optional(),
	body_locator: classificationBodyLocatorRefSchema,
	summary: z.string().optional(),
	action_summary: nullableStringSchema.optional(),
	complexity: actionComplexityDocSchema.nullable().optional(),
	pre_existing: z.boolean().optional(),
	informational_reason: informationalReasonDocSchema.nullable().optional(),
});

const classificationTemplateThreadCommentRefSchema = z.object({
	comment_id: z.int(),
	body_locator: classificationBodyLocatorRefSchema,
});

const classificationTemplateThreadItemSchema = z.object({
	thread_id: z.string(),
	disposition: z.string().optional(),
	thread_item_pointer: z.string(),
	covered_comments: z.array(classificationTemplateThreadCommentRefSchema),
	summary: z.string().optional(),
	action_summary: nullableStringSchema.optional(),
	complexity: actionComplexityDocSchema.nullable().optional(),
	pre_existing: z.boolean().optional(),
	informational_reason: informationalReasonDocSchema.nullable().optional(),
});

const classificationTemplateDiscussionCommentItemSchema = z.object({
	comment_id: z.int(),
	disposition: z.string().optional(),
	body_locator: classificationBodyLocatorRefSchema,
	summary: z.string().optional(),
	action_summary: nullableStringSchema.optional(),
	complexity: actionComplexityDocSchema.nullable().optional(),
	needs_reply: z.boolean().optional(),
	informational_reason: informationalReasonDocSchema.nullable().optional(),
});

const classificationTemplatePacketSchema = z.object({
	schema_version: z.literal(1).optional(),
	reviews: z.array(classificationTemplateReviewItemSchema).optional(),
	review_threads: z.array(classificationTemplateThreadItemSchema).optional(),
	discussion_comments: z.array(classificationTemplateDiscussionCommentItemSchema).optional(),
});

const classificationTemplateCountsSchema = z.object({
	reviews: z.int(),
	review_threads: z.int(),
	thread_comments: z.int(),
	discussion_comments: z.int(),
	resolved_review_threads_omitted: z.int(),
});

const classificationTemplateResultDocSchema = z.object({
	manifest_kind: manifestKindSchema,
	pr_number: nullableIntSchema.optional(),
	payload_path: nullableStringSchema.optional(),
	counts: classificationTemplateCountsSchema,
	classification_template: classificationTemplatePacketSchema,
});

// --- record-batch-checkpoint ------------------------------------------------------

const batchValidationCommandEvidenceSchema = z.object({
	command: z.string(),
	status: z.enum(["passed", "failed", "skipped"]),
	exit_code: nullableIntSchema.optional(),
	summary: nullableStringSchema.optional(),
});

const batchNonThreadOutcomeSummarySchema = z.object({
	source_kind: z.enum(["review", "discussion_comment"]),
	review_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	action: z.enum(["replied", "skipped", "no_reply_needed"]),
	result_comment_id: nullableIntSchema.optional(),
	reaction_added: nullableBooleanSchema.optional(),
	skip_reason: nullableStringSchema.optional(),
	summary: nullableStringSchema.optional(),
});

const batchCheckpointErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	batch_id: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	review_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	path: nullableStringSchema.optional(),
});

const batchCheckpointPlanItemSchema = z.object({
	source_kind: z.string(),
	summary: z.string(),
	action_summary: z.string(),
	review_id: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	covered_comment_ids: z.array(z.int()).optional(),
	needs_reply: nullableBooleanSchema.optional(),
	pre_existing: z.boolean().optional(),
	author: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
});

const batchSkippedThreadSummarySchema = z.object({
	thread_id: z.string(),
	skip_reason: nullableStringSchema.optional(),
	summary: nullableStringSchema.optional(),
});

const batchThreadCheckpointSummarySchema = z.object({
	review_thread_count: z.int(),
	payload_ready: nullableBooleanSchema.optional(),
	resolved_thread_ids: z.array(z.string()).optional(),
	failed_thread_ids: z.array(z.string()).optional(),
	skipped_thread_ids: z.array(z.string()).optional(),
	skipped_threads: z.array(batchSkippedThreadSummarySchema).optional(),
	ignored_non_thread_count: z.int().optional(),
	all_succeeded: nullableBooleanSchema.optional(),
});

const recordBatchCheckpointResultSchema = z.object({
	valid: z.boolean(),
	batch_complete: z.boolean(),
	batch_id: z.string(),
	complexity: nullableStringSchema.optional(),
	approval_required: nullableBooleanSchema.optional(),
	pr_number: nullableIntSchema.optional(),
	payload_path: nullableStringSchema.optional(),
	checkpoint_reference: payloadReferenceSchema.nullable().optional(),
	commit_sha: nullableStringSchema.optional(),
	changed_files: z.array(z.string()).optional(),
	validation_commands: z.array(batchValidationCommandEvidenceSchema).optional(),
	selected_items: z.array(batchCheckpointPlanItemSchema).optional(),
	thread_summary: batchThreadCheckpointSummarySchema.nullable().optional(),
	non_thread_outcomes: z.array(batchNonThreadOutcomeSummarySchema).optional(),
	errors: z.array(batchCheckpointErrorSchema).optional(),
	warnings: z.array(z.string()).optional(),
});

// --- finalize-run -----------------------------------------------------------------

const finalizeRunThreadSummarySchema = z.object({
	thread_id: z.string(),
	path: z.string(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	is_outdated: z.boolean(),
	is_resolved: z.boolean(),
	comment_count: z.int(),
	item_pointer: nullableStringSchema.optional(),
});

const finalizeRunSkippedItemSchema = z.object({
	source_kind: z.enum(["review_thread", "review", "discussion_comment"]),
	thread_id: nullableStringSchema.optional(),
	review_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	batch_id: nullableStringSchema.optional(),
	skip_reason: nullableStringSchema.optional(),
	summary: nullableStringSchema.optional(),
});

const finalizeRunCheckpointSummarySchema = z.object({
	batch_id: z.string(),
	valid: z.boolean(),
	batch_complete: z.boolean(),
	commit_sha: nullableStringSchema.optional(),
	changed_files: z.array(z.string()).optional(),
	checkpoint_reference: payloadReferenceSchema.nullable().optional(),
	resolved_thread_ids: z.array(z.string()).optional(),
	failed_thread_ids: z.array(z.string()).optional(),
	skipped_thread_ids: z.array(z.string()).optional(),
	non_thread_outcomes: z.array(batchNonThreadOutcomeSummarySchema).optional(),
	failed_validation_commands: z.array(batchValidationCommandEvidenceSchema).optional(),
});

const finalizeRunCountsSchema = z.object({
	checkpoint_batches: z.int(),
	complete_batches: z.int(),
	incomplete_batches: z.int(),
	unresolved_threads: z.int(),
	unresolved_unskipped_threads: z.int(),
	resolved_threads_from_checkpoints: z.int(),
	failed_threads_from_checkpoints: z.int(),
	skipped_threads: z.int(),
	skipped_non_thread_items: z.int(),
});

const finalizeRunErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	batch_id: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	review_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
});

const finalizeRunResultSchema = z.object({
	valid: z.boolean(),
	ready_to_stop: z.boolean(),
	all_feedback_addressed: z.boolean(),
	pr_number: z.int(),
	payload_path: nullableStringSchema.optional(),
	counts: finalizeRunCountsSchema,
	unresolved_threads: z.array(finalizeRunThreadSummarySchema).optional(),
	unresolved_unskipped_threads: z.array(finalizeRunThreadSummarySchema).optional(),
	skipped_items: z.array(finalizeRunSkippedItemSchema).optional(),
	checkpoint_summaries: z.array(finalizeRunCheckpointSummarySchema).optional(),
	errors: z.array(finalizeRunErrorSchema).optional(),
	warnings: z.array(z.string()).optional(),
});

// --- stack-feedback-diff-current ---------------------------------------------------

const stackFeedbackDiffPlannedThreadSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	thread_id: z.string(),
	source_batch_id: nullableStringSchema.optional(),
	summary: z.string(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	is_outdated: nullableBooleanSchema.optional(),
});

const stackFeedbackDiffCurrentThreadSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	thread_id: z.string(),
	path: z.string(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	is_outdated: z.boolean(),
	comment_count: z.int(),
});

const stackFeedbackDiffMissingOrOutdatedThreadSchema = stackFeedbackDiffPlannedThreadSchema.extend({
	reason: z.string(),
	changed_fields: z.array(z.string()).optional(),
});

const stackFeedbackDiffCurrentErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	pr_number: nullableIntSchema.optional(),
	thread_id: nullableStringSchema.optional(),
});

const stackFeedbackDiffCurrentSummarySchema = z.object({
	pr_count: z.int(),
	planned_actionable_review_threads: z.int(),
	planned_known_review_threads: z.int(),
	current_unresolved_review_threads: z.int(),
	planned_still_unresolved: z.int(),
	planned_already_resolved: z.int(),
	new_unresolved_threads: z.int(),
	missing_or_outdated_planned_threads: z.int(),
});

const stackFeedbackDiffCurrentResultSchema = z.object({
	valid: z.boolean(),
	safe_to_resolve_planned: z.boolean(),
	planned_still_unresolved: z.array(stackFeedbackDiffPlannedThreadSchema).optional(),
	planned_already_resolved: z.array(stackFeedbackDiffPlannedThreadSchema).optional(),
	new_unresolved_threads: z.array(stackFeedbackDiffCurrentThreadSchema).optional(),
	missing_or_outdated_planned_threads: z.array(stackFeedbackDiffMissingOrOutdatedThreadSchema).optional(),
	warnings: z.array(z.string()).optional(),
	errors: z.array(stackFeedbackDiffCurrentErrorSchema).optional(),
	summary: stackFeedbackDiffCurrentSummarySchema,
});

// --- stack-feedback-prep -----------------------------------------------------------

const stackFeedbackPrepRequestSchema = z.object({
	stack_json: nullableStringSchema.optional(),
	payload_session_id: nullableStringSchema.optional(),
	stdout_mode: z.enum(["full", "compact"]).optional(),
	include_resolved: z.boolean().optional(),
	include_empty_reviews: z.boolean().optional(),
});

const discussionTriageByReasonSchema = z.partialRecord(discussionTriageReasonSchema, z.int());

const stackDiscussionTriageItemSchema = z.object({
	comment_id: z.int(),
	author: z.string(),
	classification_hint: z.enum(["automation", "human_like", "needs_agent_review"]),
	reason: discussionTriageReasonSchema,
	body_locator: bodyLocatorSchema,
});

const stackDiscussionTriageSummarySchema = z.object({
	automation_like: z.int(),
	human_like: z.int(),
	needs_agent_review: z.int(),
	by_reason: discussionTriageByReasonSchema,
	items: z.array(stackDiscussionTriageItemSchema).optional(),
});

const stackDiscussionTriageCompactSummarySchema = z.object({
	automation_like: z.int(),
	human_like: z.int(),
	needs_agent_review: z.int(),
	by_reason: discussionTriageByReasonSchema,
});

const stackFeedbackPrepPrResultSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	head_ref_name: nullableStringSchema.optional(),
	base_ref_name: nullableStringSchema.optional(),
	manifest: getFeedbackPayloadManifestSchema,
	manifest_summary_reference: payloadReferenceSchema,
	raw_feedback_reference: payloadReferenceSchema,
	classification_template: classificationTemplateResultDocSchema,
	classification_template_reference: payloadReferenceSchema,
	counts: feedbackCountsSchema,
	discussion_triage: stackDiscussionTriageSummarySchema,
});

const stackFeedbackPrepSummarySchema = z.object({
	prs: z.int(),
	reviews: z.int(),
	unresolved_review_threads: z.int(),
	discussion_comments: z.int(),
	automation_discussion_comments: z.int(),
	discussion_comments_needing_agent_review: z.int(),
});

const stackFeedbackPrepResultSchema = z.object({
	payload_session_id: z.string(),
	include_resolved: z.boolean().optional(),
	stack: z.array(stackFeedbackPrepPrResultSchema),
	stack_summary_reference: payloadReferenceSchema.nullable().optional(),
	summary: stackFeedbackPrepSummarySchema,
});

const stackFeedbackPrepCompactPrResultSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	head_ref_name: nullableStringSchema.optional(),
	base_ref_name: nullableStringSchema.optional(),
	counts: feedbackCountsSchema,
	raw_feedback_reference: payloadReferenceSchema,
	manifest_summary_reference: payloadReferenceSchema,
	classification_template_reference: payloadReferenceSchema,
	discussion_triage_summary: stackDiscussionTriageCompactSummarySchema,
});

const stackFeedbackPrepCompactResultSchema = z.object({
	payload_session_id: z.string(),
	include_resolved: z.boolean().optional(),
	summary: stackFeedbackPrepSummarySchema,
	stack_summary_reference: payloadReferenceSchema,
	stack: z.array(stackFeedbackPrepCompactPrResultSchema),
});

const stackFeedbackPrepResultUnionSchema = z.union([stackFeedbackPrepResultSchema, stackFeedbackPrepCompactResultSchema]);

// --- stack-feedback-plan -----------------------------------------------------------

const stackFeedbackPlanRequestSchema = z.object({
	payload_json: nullableStringSchema.optional(),
	payload_file: nullableStringSchema.optional(),
	prep_reference: nullableStringSchema.optional(),
	payload_session_id: nullableStringSchema.optional(),
	stdout_mode: z.enum(["full", "compact"]).optional(),
});

const stackFeedbackPlanValidationPrResultSchema = z.object({
	pr_number: z.int(),
	valid: z.boolean(),
	counts: z.unknown(),
	errors: z.array(feedbackClassificationValidationErrorSchema).optional(),
});

const stackFeedbackPlanValidationSummarySchema = z.object({
	all_valid: z.boolean(),
	per_pr: z.array(stackFeedbackPlanValidationPrResultSchema),
});

const stackFeedbackPlanItemSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	source_batch_id: nullableStringSchema.optional(),
	source_kind: planSourceKindDocSchema,
	summary: z.string(),
	action_summary: nullableStringSchema.optional(),
	complexity: nullableStringSchema.optional(),
	approval_required: z.boolean().optional(),
	review_id: nullableStringSchema.optional(),
	review_state: nullableStringSchema.optional(),
	submitted_at: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	covered_comment_ids: z.array(z.int()).optional(),
	body_locator: bodyLocatorSchema.nullable().optional(),
	thread_item_pointer: nullableStringSchema.optional(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	is_outdated: nullableBooleanSchema.optional(),
	author: nullableStringSchema.optional(),
	needs_reply: nullableBooleanSchema.optional(),
});

const stackFeedbackPlanBatchSchema = z.object({
	batch_id: z.string(),
	complexity: z.string(),
	approval_required: z.boolean(),
	items: z.array(stackFeedbackPlanItemSchema),
});

const stackFeedbackPlanInformationalItemSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	source_kind: planSourceKindDocSchema,
	summary: z.string(),
	informational_reason: z.string(),
	user_decision_required: z.boolean(),
	allowed_decisions: z.array(z.string()).optional(),
	review_id: nullableStringSchema.optional(),
	review_state: nullableStringSchema.optional(),
	submitted_at: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	covered_comment_ids: z.array(z.int()).optional(),
	body_locator: bodyLocatorSchema.nullable().optional(),
	thread_item_pointer: nullableStringSchema.optional(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	start_line: nullableIntSchema.optional(),
	is_outdated: nullableBooleanSchema.optional(),
	author: nullableStringSchema.optional(),
});

const stackFeedbackDecisionDocketItemSchema = z.object({
	decision_kind: z.enum([
		"approval_required_action",
		"informational_review_thread",
		"discussion_comment_action",
		"discussion_comment_review",
	]),
	pr_number: z.int(),
	branch: z.string(),
	title: nullableStringSchema.optional(),
	url: nullableStringSchema.optional(),
	source_kind: planSourceKindDocSchema,
	thread_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	summary: z.string(),
	action_summary: nullableStringSchema.optional(),
	recommended_decision: z.string(),
	approval_required: z.boolean().optional(),
});

const stackFeedbackAutomationDiscussionSummarySchema = z.object({
	automation_like: z.int(),
	human_like: z.int(),
	needs_agent_review: z.int(),
	by_reason: discussionTriageByReasonSchema,
});

const stackFeedbackPlanSummarySchema = z.object({
	actionable_items: z.int(),
	approval_required_items: z.int(),
	informational_items: z.int(),
	automation_discussion_comments: z.int(),
});

const stackFeedbackPlanResultSchema = z.object({
	valid: z.boolean(),
	payload_session_id: z.string(),
	pr_count: z.int(),
	validation: stackFeedbackPlanValidationSummarySchema,
	batches: z.array(stackFeedbackPlanBatchSchema).optional(),
	informational: z.array(stackFeedbackPlanInformationalItemSchema).optional(),
	automation_discussion_summary: stackFeedbackAutomationDiscussionSummarySchema.nullable().optional(),
	decision_docket: z.array(stackFeedbackDecisionDocketItemSchema).optional(),
	stack_plan_reference: payloadReferenceSchema.nullable().optional(),
	summary: stackFeedbackPlanSummarySchema.nullable().optional(),
});

const stackFeedbackPlanCompactItemSchema = z.object({
	pr_number: z.int(),
	branch: z.string(),
	source_kind: planSourceKindDocSchema,
	review_id: nullableStringSchema.optional(),
	thread_id: nullableStringSchema.optional(),
	discussion_comment_id: nullableIntSchema.optional(),
	path: nullableStringSchema.optional(),
	line: nullableIntSchema.optional(),
	summary: z.string(),
	action_summary: nullableStringSchema.optional(),
	complexity: nullableStringSchema.optional(),
	approval_required: z.boolean().optional(),
});

const stackFeedbackPlanCompactBatchSchema = z.object({
	batch_id: z.string(),
	complexity: z.string(),
	approval_required: z.boolean(),
	item_count: z.int(),
	items: z.array(stackFeedbackPlanCompactItemSchema),
});

const stackFeedbackPlanCompactInformationalSummarySchema = z.object({
	total: z.int(),
	user_decision_required: z.int(),
	by_reason: z.record(z.string(), z.int()),
});

const stackFeedbackPlanCompactResultSchema = z.object({
	valid: z.boolean(),
	payload_session_id: z.string(),
	pr_count: z.int(),
	validation: stackFeedbackPlanValidationSummarySchema,
	batches: z.array(stackFeedbackPlanCompactBatchSchema).optional(),
	informational_summary: stackFeedbackPlanCompactInformationalSummarySchema.nullable().optional(),
	automation_discussion_summary: stackFeedbackAutomationDiscussionSummarySchema.nullable().optional(),
	decision_docket: z.array(stackFeedbackDecisionDocketItemSchema).optional(),
	stack_plan_reference: payloadReferenceSchema.nullable().optional(),
	summary: stackFeedbackPlanSummarySchema.nullable().optional(),
});

const stackFeedbackPlanResultUnionSchema = z.union([stackFeedbackPlanResultSchema, stackFeedbackPlanCompactResultSchema]);

// --- document registry --------------------------------------------------------------

function schemaDocument(requestSchema: z.ZodType, resultSchema: z.ZodType): JsonSchemaDocument {
	return {
		input_json_schema: z.toJSONSchema(requestSchema),
		output_json_schema: z.toJSONSchema(resultSchema),
	};
}

const SCHEMA_DOCUMENT_BUILDERS: ReadonlyMap<string, () => JsonSchemaDocument> = new Map([
	["build-resolve-thread-batch-payload", () => schemaDocument(payloadJsonOrFileRequestSchema, buildResolveThreadBatchPayloadResultSchema)],
	["build-stack-resolve-thread-payloads", () => schemaDocument(buildStackResolveThreadPayloadsRequestSchema, buildStackResolveThreadPayloadsResultSchema)],
	["classification-template", buildClassificationTemplateSchemaDocument],
	["finalize-run", () => schemaDocument(payloadJsonOrFileRequestSchema, finalizeRunResultSchema)],
	["get-feedback", () => schemaDocument(getFeedbackRequestSchema, getFeedbackResultSchema)],
	["plan-feedback", buildPlanFeedbackSchemaDocument],
	["prepare-run", () => schemaDocument(prepareRunRequestSchema, prepareRunResultSchema)],
	["read-feedback-detail", () => schemaDocument(readFeedbackDetailRequestSchema, readFeedbackDetailResultSchema)],
	["read-feedback-details", () => schemaDocument(readFeedbackDetailsRequestSchema, readFeedbackDetailsResultSchema)],
	["record-batch-checkpoint", () => schemaDocument(payloadJsonOrFileRequestSchema, recordBatchCheckpointResultSchema)],
	["reply-to-discussion", () => schemaDocument(replyToDiscussionRequestSchema, replyToDiscussionResultSchema)],
	["reply-to-review", () => schemaDocument(replyToReviewRequestSchema, replyToReviewResultSchema)],
	["resolve-thread-batch", () => schemaDocument(payloadJsonOrFileRequestSchema, resolveThreadBatchResultSchema)],
	["resolve-thread-with-reply", () => schemaDocument(resolveThreadWithReplyRequestSchema, resolveThreadWithReplyResultSchema)],
	["stack-feedback-diff-current", () => schemaDocument(stackFeedbackDiffCurrentRequestSchema, stackFeedbackDiffCurrentResultSchema)],
	["stack-feedback-plan", () => schemaDocument(stackFeedbackPlanRequestSchema, stackFeedbackPlanResultUnionSchema)],
	["stack-feedback-prep", () => schemaDocument(stackFeedbackPrepRequestSchema, stackFeedbackPrepResultUnionSchema)],
	["summarize-feedback", () => schemaDocument(summarizeFeedbackRequestSchema, summarizeFeedbackResultSchema)],
	["validate-feedback-classification", buildValidateFeedbackClassificationSchemaDocument],
]);

export function buildOperationSchemaDocument(operation: string): JsonSchemaDocument | undefined {
	const builder = SCHEMA_DOCUMENT_BUILDERS.get(operation);
	return builder?.();
}
