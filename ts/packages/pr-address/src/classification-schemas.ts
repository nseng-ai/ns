import { z } from "zod";

import { feedbackPlanResultSchema, feedbackPlanningValidationResultSchema } from "./feedback-plan-contracts.ts";

const nullableCliStringSchema = z.string().nullable().default(null);

const validateFeedbackClassificationRequestSchema = z
	.object({
		payload_json: nullableCliStringSchema.describe("Inline wrapper payload JSON."),
		payload_file: nullableCliStringSchema.describe("Path to a wrapper payload JSON file."),
		manifest_json: nullableCliStringSchema.describe("Inline split manifest JSON."),
		manifest_file: nullableCliStringSchema.describe("Path to a split manifest JSON file."),
		classification_json: nullableCliStringSchema.describe("Inline split classification JSON."),
		classification_file: nullableCliStringSchema.describe("Path to a split classification JSON file."),
	})
	.strict();

const planFeedbackRequestSchema = z
	.object({
		payload_json: nullableCliStringSchema.describe("Inline wrapper payload JSON."),
		payload_file: nullableCliStringSchema.describe("Path to a wrapper payload JSON file."),
	})
	.strict();

export const classificationTemplateRequestSchema = z
	.object({
		manifest_json: nullableCliStringSchema.describe("Inline compact payload manifest JSON."),
		manifest_file: nullableCliStringSchema.describe("Path to a compact payload manifest JSON file."),
	})
	.strict();

export const bodyLocatorSchema = z
	.object({
		json_pointer: z.string(),
		item_pointer: z.string().nullable().default(null),
	})
	.loose();

export const coveredCommentTemplateSchema = z
	.object({
		comment_id: z.number().int(),
		body_locator: bodyLocatorSchema,
	})
	.loose();

export const classificationTemplateSchema = z
	.object({
		schema_version: z.literal(1),
		reviews: z.array(
			z
				.object({
					review_id: z.string(),
					disposition: z.string(),
					body_locator: bodyLocatorSchema.optional(),
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
					body_locator: bodyLocatorSchema.optional(),
				})
				.loose(),
		),
	})
	.loose();

export const classificationTemplateResultSchema = z
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
	})
	.loose();

export interface JsonSchemaDocument {
	input_json_schema: unknown;
	output_json_schema: unknown;
}

export function buildClassificationTemplateSchemaDocument(): JsonSchemaDocument {
	return {
		input_json_schema: z.toJSONSchema(classificationTemplateRequestSchema),
		output_json_schema: z.toJSONSchema(classificationTemplateResultSchema),
	};
}

export function buildValidateFeedbackClassificationSchemaDocument(): JsonSchemaDocument {
	return {
		input_json_schema: z.toJSONSchema(validateFeedbackClassificationRequestSchema),
		output_json_schema: z.toJSONSchema(feedbackPlanningValidationResultSchema),
	};
}

export function buildPlanFeedbackSchemaDocument(): JsonSchemaDocument {
	return {
		input_json_schema: z.toJSONSchema(planFeedbackRequestSchema),
		output_json_schema: z.toJSONSchema(feedbackPlanResultSchema),
	};
}
