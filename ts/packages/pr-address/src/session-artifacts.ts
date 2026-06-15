import { z } from "zod";

import { feedbackPlanningValidationResultSchema } from "./feedback-plan-contracts.ts";
import { isSafeSegment, payloadError, type JsonPayloadRole, type PayloadArtifactStore, type PayloadReference, type PayloadResult } from "./payload-store.ts";

export type PrArtifactKind = "feedback" | "manifest" | "classification-template" | "classification" | "plan";
export type PrBatchArtifactKind = "resolve-build" | "resolution" | "checkpoint";
export type StackArtifactKind = "prep" | "plan" | "thread-state";
export type StackBatchArtifactKind = "current";

export interface ResolvedSessionArtifact<T = unknown> {
	reference: PayloadReference;
	value: T;
}

export const classificationArtifactSchema = z.looseObject({
	pr_number: z.number().int(),
	classification: z.record(z.string(), z.unknown()),
	validation: feedbackPlanningValidationResultSchema,
});

export type ClassificationArtifact = z.infer<typeof classificationArtifactSchema>;

export function prArtifactDescriptor(options: { prNumber: number; kind: PrArtifactKind }): string {
	return `pr-address-pr-${positivePrNumber(options.prNumber)}-${options.kind}`;
}

export function prBatchArtifactDescriptor(options: { prNumber: number; batchId: string; kind: PrBatchArtifactKind }): string {
	return `pr-address-pr-${positivePrNumber(options.prNumber)}-batch-${safeBatchId(options.batchId)}-${options.kind}`;
}

export function stackArtifactDescriptor(kind: StackArtifactKind): string {
	return `pr-address-stack-${kind}`;
}

export function stackBatchArtifactDescriptor(options: { batchId: string; kind: StackBatchArtifactKind }): string {
	return `pr-address-stack-batch-${safeBatchId(options.batchId)}-${options.kind}`;
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
	throw new Error(`Batch id must be a safe segment: ${String(value)}`);
}
