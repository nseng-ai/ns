import { z } from "zod";
import { type JsonSchemaDocument } from "@asdl/clinkr";

import { ACTION_COMPLEXITIES, INFORMATIONAL_REASONS } from "../feedback-plan-contracts.ts";

export const nullableStringSchema = z.string().nullable();
export const nullableIntSchema = z.int().nullable();
export const nullableBooleanSchema = z.boolean().nullable();

// --- shared enums -----------------------------------------------------------

export const prReviewStateSchema = z.enum(["PENDING", "COMMENTED", "APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);
export const prStateSchema = z.enum(["OPEN", "CLOSED", "MERGED"]);
export const resolutionReplyModeSchema = z.enum(["fixed", "pre_existing", "explained", "planned"]);
export const detailKindSchema = z.enum([
	"review",
	"review_body",
	"review_thread",
	"thread_comment",
	"thread_comment_body",
	"discussion_comment",
	"discussion_comment_body",
]);
export const manifestKindSchema = z.enum(["get_feedback", "prepare_run"]);
export const actionComplexityDocSchema = z.enum(ACTION_COMPLEXITIES);
export const informationalReasonDocSchema = z.enum(INFORMATIONAL_REASONS);
export const validationErrorCodeSchema = z.enum([
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
export const validationItemKindSchema = z.enum(["review", "review_thread", "thread_comment", "discussion_comment", "packet"]);
export const planSourceKindDocSchema = z.enum(["review", "review_thread", "discussion_comment"]);
export const discussionTriageReasonSchema = z.enum([
	"vercel_status",
	"graphite_status",
	"roaster_summary",
	"github_actions_status",
	"bot_status",
	"human_like",
	"direct_request_possible",
	"uncertain",
]);

// --- payload store reference -------------------------------------------------

export const payloadReferenceSchema = z.object({
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

export const resolutionProvenanceSchema = z.discriminatedUnion("kind", [localBranchResolutionProvenanceSchema, prResolutionProvenanceSchema]);

const localBranchResolutionProvenanceInputSchema = z.object({
	kind: z.literal("local_branch"),
	branch: z.string(),
});

const prResolutionProvenanceInputSchema = z.object({
	kind: z.literal("pr"),
	pr_number: z.int(),
});

export const resolutionProvenanceInputSchema = z.discriminatedUnion("kind", [
	localBranchResolutionProvenanceInputSchema,
	prResolutionProvenanceInputSchema,
]);

// --- shared request shapes ----------------------------------------------------

export const payloadJsonOrFileRequestSchema = z.object({
	payload_json: nullableStringSchema.optional(),
	payload_file: nullableStringSchema.optional(),
});

export const stackFeedbackDiffCurrentRequestSchema = payloadJsonOrFileRequestSchema.extend({
	stack_plan_reference: nullableStringSchema.optional(),
	current_prep_reference: nullableStringSchema.optional(),
	harness_session_id: nullableStringSchema.optional(),
});

export const buildStackResolveThreadPayloadsRequestSchema = z.object({
	batch_id: z.string(),
	commit_sha: nullableStringSchema.optional(),
	continue_on_error: z.boolean().optional(),
	decisions_file: z.string(),
	harness_session_id: nullableStringSchema.optional(),
});

export function schemaDocument(requestSchema: z.ZodType, resultSchema: z.ZodType): JsonSchemaDocument {
	return {
		input_json_schema: z.toJSONSchema(requestSchema),
		output_json_schema: z.toJSONSchema(resultSchema),
	};
}
