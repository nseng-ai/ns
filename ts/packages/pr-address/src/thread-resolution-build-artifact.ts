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
	payload_ready: z.literal(true),
	payload: resolveThreadBatchPayloadSchema,
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

export type ResolveThreadBatchPayload = z.infer<typeof resolveThreadBatchPayloadSchema>;
export type ThreadResolutionBuildArtifact = z.infer<typeof threadResolutionBuildArtifactSchema>;
