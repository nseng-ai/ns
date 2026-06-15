import { z } from "zod";

import { feedbackPlanningValidationResultSchema } from "./feedback-plan-contracts.ts";
import { payloadReferenceSchema } from "./feedback-manifest-contracts.ts";
import { isSafeSegment, payloadError, type JsonPayloadRole, type PayloadArtifactStore, type PayloadReference, type PayloadResult } from "./payload-store.ts";

export type PrArtifactKind = "feedback" | "manifest" | "classification-template" | "classification" | "plan";
export type StackArtifactKind = "prep" | "plan";
export type PrBatchArtifactKind = "resolve-build" | "thread-resolution" | "checkpoint";

export interface ResolvedSessionArtifact<T = unknown> {
	reference: PayloadReference;
	value: T;
}

export const classificationArtifactSchema = z.looseObject({
	pr_number: z.number().int(),
	classification: z.record(z.string(), z.unknown()),
	validation: feedbackPlanningValidationResultSchema,
});

const nullableStringSchema = z.string().nullable().default(null);
const resolveBuildResultSchema = z.looseObject({
	valid: z.boolean(),
	payload_ready: z.boolean(),
	batch_id: z.string(),
	commit_sha: nullableStringSchema,
	continue_on_error: z.boolean().default(false),
	review_thread_count: z.number().int(),
	resolved_thread_count: z.number().int().default(0),
	skipped_thread_count: z.number().int().default(0),
	ignored_non_thread_items: z.array(z.unknown()).default([]),
	skipped_items: z.array(z.looseObject({ thread_id: z.string(), skip_reason: nullableStringSchema, summary: nullableStringSchema })).default([]),
	payload: z.looseObject({ items: z.array(z.looseObject({ thread_id: z.string() })).default([]) }).nullable().default(null),
	errors: z.array(z.looseObject({ code: z.string(), message: z.string(), batch_id: nullableStringSchema, thread_id: nullableStringSchema })).default([]),
});
const threadResolutionResultSchema = z.looseObject({
	all_succeeded: z.boolean(),
	results: z.array(z.looseObject({ thread_id: z.string(), status: z.enum(["resolved", "failed", "skipped"]) })).default([]),
});

export const resolveBuildArtifactSchema = z.looseObject({
	artifact_kind: z.literal("resolve_build"),
	pr_number: z.number().int(),
	batch_id: z.string(),
	source_plan: payloadReferenceSchema,
	build: resolveBuildResultSchema,
});

export const threadResolutionArtifactSchema = z.looseObject({
	artifact_kind: z.literal("thread_resolution"),
	pr_number: z.number().int(),
	batch_id: z.string(),
	source_build: payloadReferenceSchema,
	result: threadResolutionResultSchema,
});

export const checkpointArtifactSchema = z.looseObject({
	artifact_kind: z.literal("checkpoint"),
	valid: z.boolean(),
	batch_complete: z.boolean(),
	pr_number: z.number().int().nullable().default(null),
	batch_id: z.string(),
	checkpoint_reference: payloadReferenceSchema.nullable().default(null),
	commit_sha: nullableStringSchema,
	changed_files: z.array(z.string()).default([]),
	validation_commands: z.array(z.unknown()).default([]),
	thread_summary: z.unknown().nullable().default(null),
	non_thread_outcomes: z.array(z.unknown()).default([]),
});

export type ClassificationArtifact = z.infer<typeof classificationArtifactSchema>;
export type ResolveBuildArtifact = z.infer<typeof resolveBuildArtifactSchema>;
export type ThreadResolutionArtifact = z.infer<typeof threadResolutionArtifactSchema>;
export type CheckpointArtifact = z.infer<typeof checkpointArtifactSchema>;

export function prArtifactDescriptor(options: { prNumber: number; kind: PrArtifactKind }): string {
	return `pr-address-pr-${positivePrNumber(options.prNumber)}-${options.kind}`;
}

export function stackArtifactDescriptor(kind: StackArtifactKind): string {
	return `pr-address-stack-${kind}`;
}

export function prBatchArtifactDescriptor(options: { prNumber: number; batchId: string; kind: PrBatchArtifactKind }): string {
	const batchId = safeBatchId(options.batchId);
	return `pr-address-pr-${positivePrNumber(options.prNumber)}-batch-${batchId}-${options.kind}`;
}

export async function resolveLatestJsonSessionArtifact<T = unknown>(options: {
	store: PayloadArtifactStore;
	descriptor: string;
	role: JsonPayloadRole;
	schema?: z.ZodType<T> | undefined;
}): Promise<PayloadResult<ResolvedSessionArtifact<T>>> {
	const artifact = await options.store.findLatestJsonArtifact({ descriptor: options.descriptor, role: options.role });
	if (artifact.type === "error") return artifact;
	const value = parseResolvedValue(artifact.value.value, options.schema, options.descriptor);
	if (value.type === "error") return value;
	return { type: "ok", value: { reference: artifact.value.reference, value: value.value } };
}

function parseResolvedValue<T>(value: unknown, schema: z.ZodType<T> | undefined, descriptor: string): PayloadResult<T> {
	if (schema === undefined) return { type: "ok", value: value as T };
	const parsed = schema.safeParse(value);
	if (parsed.success) return { type: "ok", value: parsed.data };
	return payloadError("payload_lookup_failed", `Latest payload artifact ${descriptor} failed schema validation: ${z.prettifyError(parsed.error)}`);
}

function positivePrNumber(value: number): number {
	if (Number.isInteger(value) && value > 0) return value;
	throw new Error(`PR number must be a positive integer: ${String(value)}`);
}

function safeBatchId(value: string): string {
	const trimmed = value.trim();
	if (isSafeSegment(trimmed)) return trimmed;
	throw new Error(`batch_id must be a safe payload descriptor segment: ${String(value)}`);
}
