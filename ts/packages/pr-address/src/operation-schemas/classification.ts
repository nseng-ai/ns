import { z } from "zod";
import { type JsonSchemaDocument } from "@asdl/clinkr";

import { classificationLocatorSchema } from "../classification.ts";
import { feedbackPlanResultSchema, feedbackPlanningValidationResultSchema } from "../feedback-plan-contracts.ts";
import {
	actionComplexityDocSchema,
	informationalReasonDocSchema,
	manifestKindSchema,
	nullableIntSchema,
	nullableStringSchema,
	payloadReferenceSchema,
	schemaDocument,
	stdoutModeRequestSchema,
	validationErrorCodeSchema,
	validationItemKindSchema,
} from "./shared.ts";

// --- classification validation / template contracts -----------------------------------

export const feedbackClassificationValidationErrorSchema = z.object({
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

const manifestResolvedInputsSchema = z.object({
	manifest: payloadReferenceSchema,
});

export const classificationTemplateResultDocSchema = z.object({
	manifest_kind: manifestKindSchema,
	pr_number: nullableIntSchema.optional(),
	payload_path: nullableStringSchema.optional(),
	counts: classificationTemplateCountsSchema,
	classification_template: classificationTemplatePacketSchema,
});

// --- classification request schemas (legacy template builders) --------------------

const nullableCliStringSchema = z.string().nullable().default(null);

const validateFeedbackClassificationRequestSchema = stdoutModeRequestSchema
	.extend({
		pr_number: z.int().describe("PR number for payload-session manifest resolution and classification persistence."),
		classification_json: nullableCliStringSchema.describe("Inline PR feedback classification packet JSON."),
		classification_file: nullableCliStringSchema.describe("Path to a PR feedback classification packet JSON file."),
		harness_session_id: nullableCliStringSchema.describe("Payload session id override for manifest resolution and classification persistence."),
	})
	.strict();

const planFeedbackRequestSchema = stdoutModeRequestSchema
	.extend({
		pr_number: z.int().describe("PR number for payload-session manifest and classification resolution."),
		harness_session_id: nullableCliStringSchema.describe("Payload session id override for session resolution and plan persistence."),
	})
	.strict();

export const classificationTemplateRequestSchema = stdoutModeRequestSchema
	.extend({
		pr_number: z.int().describe("PR number for payload-session manifest resolution."),
		harness_session_id: nullableCliStringSchema.describe("Payload session id override for manifest resolution."),
	})
	.strict();

// Template schemas using the shared classificationLocatorSchema from classification.ts

const coveredCommentTemplateSchema = z
	.object({
		comment_id: z.number().int(),
		body_locator: classificationLocatorSchema,
	})
	.loose();

const classificationTemplateSchema = z
	.object({
		schema_version: z.literal(1),
		reviews: z.array(
			z
				.object({
					review_id: z.string(),
					disposition: z.string(),
					body_locator: classificationLocatorSchema.optional(),
				})
				.loose(),
		),
		review_threads: z.array(
			z
				.object({
					thread_id: z.string(),
					disposition: z.string(),
					covered_comments: z.array(coveredCommentTemplateSchema),
				})
				.loose(),
		),
		discussion_comments: z.array(
			z
				.object({
					comment_id: z.number().int(),
					disposition: z.string(),
					body_locator: classificationLocatorSchema.optional(),
				})
				.loose(),
		),
	})
	.loose();

const classificationTemplateResultSchema = z
	.object({
		manifest_kind: z.string(),
		pr_number: z.number().int().nullable(),
		payload_path: z.string().nullable(),
		counts: z
			.object({
				reviews: z.number().int(),
				review_threads: z.number().int(),
				thread_comments: z.number().int(),
				discussion_comments: z.number().int(),
				resolved_review_threads_omitted: z.number().int(),
			})
			.loose(),
		classification_template: classificationTemplateSchema,
		resolved_inputs: manifestResolvedInputsSchema.optional(),
	})
	.loose();

// --- schema document builders for classification trio -----------------------------

export function buildClassificationTemplateSchemaDocument(): JsonSchemaDocument {
	return schemaDocument(classificationTemplateRequestSchema, classificationTemplateResultSchema);
}

const validateFeedbackClassificationResultSchema = feedbackPlanningValidationResultSchema.extend({
	classification_reference: payloadReferenceSchema.optional(),
	resolved_inputs: manifestResolvedInputsSchema,
});

const planFeedbackResolvedInputsSchema = z.object({
	manifest: payloadReferenceSchema,
	classification: payloadReferenceSchema,
});

const planFeedbackResultSchema = feedbackPlanResultSchema.extend({
	plan_reference: payloadReferenceSchema.nullable().optional(),
	resolved_inputs: planFeedbackResolvedInputsSchema.optional(),
});

export function buildValidateFeedbackClassificationSchemaDocument(): JsonSchemaDocument {
	return schemaDocument(validateFeedbackClassificationRequestSchema, validateFeedbackClassificationResultSchema);
}

export function buildPlanFeedbackSchemaDocument(): JsonSchemaDocument {
	return schemaDocument(planFeedbackRequestSchema, planFeedbackResultSchema);
}
