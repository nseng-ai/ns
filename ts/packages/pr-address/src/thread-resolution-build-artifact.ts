import { z } from "zod";

import { payloadReferenceSchema } from "./feedback-manifest-contracts.ts";

export const resolutionProvenanceInputSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("local_branch"), branch: z.string() }).strict(),
	z.object({ kind: z.literal("pr"), pr_number: z.number().int() }).strict(),
]);

export const resolveThreadBatchPayloadItemSchema = z.object({
	thread_id: z.string(),
	mode: z.enum(["fixed", "pre_existing", "explained", "planned"]),
	message: z.string().nullable().default(null),
	commit_sha: z.string().nullable().default(null),
	provenance: resolutionProvenanceInputSchema.nullable().default(null),
});

export const resolveThreadBatchPayloadSchema = z.object({
	commit_sha: z.string().nullable().default(null),
	continue_on_error: z.boolean().default(false),
	items: z.array(resolveThreadBatchPayloadItemSchema),
});

export const threadResolutionBuildArtifactSchema = z.object({
	artifact_kind: z.literal("thread_resolution_build"),
	source: z.enum(["single_pr", "stack"]),
	pr_number: z.number().int(),
	batch_id: z.string(),
	commit_sha: z.string().nullable(),
	continue_on_error: z.boolean(),
	payload_ready: z.boolean(),
	payload: resolveThreadBatchPayloadSchema.nullable(),
	resolved_inputs: z.object({ plan: payloadReferenceSchema }),
	build: z.object({
		review_thread_count: z.number().int(),
		resolved_thread_count: z.number().int(),
		skipped_thread_count: z.number().int(),
		skipped_items: z.array(z.unknown()).default([]),
		ignored_non_thread_items: z.array(z.unknown()).default([]),
		warnings: z.array(z.string()).default([]),
	}),
});

export const threadResolutionResultArtifactSchema = z.object({
	artifact_kind: z.literal("thread_resolution_result"),
	source: z.enum(["single_pr", "stack"]),
	pr_number: z.number().int(),
	batch_id: z.string(),
	build_reference: payloadReferenceSchema,
	payload: resolveThreadBatchPayloadSchema,
	result: z.object({
		total: z.number().int(),
		resolved: z.number().int(),
		failed: z.number().int(),
		skipped: z.number().int(),
		all_succeeded: z.boolean(),
		results: z.array(
			z.looseObject({
				index: z.number().int(),
				thread_id: z.string(),
				mode: z.enum(["fixed", "pre_existing", "explained", "planned"]),
				status: z.enum(["resolved", "failed", "skipped"]),
			}),
		),
	}),
});

export type ResolveThreadBatchPayload = z.infer<typeof resolveThreadBatchPayloadSchema>;
export type ThreadResolutionBuildArtifact = z.infer<typeof threadResolutionBuildArtifactSchema>;
export type ThreadResolutionResultArtifact = z.infer<typeof threadResolutionResultArtifactSchema>;
