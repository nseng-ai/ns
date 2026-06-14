import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { feedbackPlanningValidationResultSchema } from "./feedback-plan-contracts.ts";
import {
	PAYLOAD_FILENAME_PATTERN,
	PayloadStore,
	payloadError,
	readJsonPayloadArtifact,
	type JsonPayloadRole,
	type PayloadReference,
	type PayloadResult,
} from "./payload-store.ts";

export type PrArtifactKind = "feedback" | "manifest" | "classification-template" | "classification" | "plan";
export type StackArtifactKind = "prep" | "plan";

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

interface PayloadCandidate {
	filename: string;
	sequence: number;
	createdAtUtc: string;
}

export function prArtifactDescriptor(options: { prNumber: number; kind: PrArtifactKind }): string {
	return `pr-address-pr-${positivePrNumber(options.prNumber)}-${options.kind}`;
}

export function stackArtifactDescriptor(kind: StackArtifactKind): string {
	return `pr-address-stack-${kind}`;
}

export async function resolveLatestJsonSessionArtifact<T = unknown>(options: {
	store: PayloadStore;
	descriptor: string;
	role: JsonPayloadRole;
	schema?: z.ZodType<T> | undefined;
}): Promise<PayloadResult<ResolvedSessionArtifact<T>>> {
	const candidate = await latestPayloadCandidate(options.store, options.descriptor, options.role);
	if (candidate.type === "error") return candidate;
	const payloadPath = join(options.store.payloadDir, candidate.value.filename);
	let payloadStats;
	try {
		payloadStats = await stat(payloadPath);
	} catch (error) {
		return payloadError("payload_lookup_failed", `Failed to stat latest payload artifact ${payloadPath}: ${errorMessage(error)}`);
	}
	const parsed = await readJsonPayloadArtifact(payloadPath, { allowedRoles: new Set([options.role]) });
	if (parsed.type === "error") return parsed;
	const value = parseResolvedValue(parsed.value, options.schema, options.descriptor);
	if (value.type === "error") return value;
	return {
		type: "ok",
		value: {
			reference: {
				payload_path: payloadPath,
				session_id: options.store.sessionId,
				descriptor: options.descriptor,
				role: options.role,
				created_at_utc: candidate.value.createdAtUtc,
				sequence: candidate.value.sequence,
				payload_bytes: payloadStats.size,
				content_type: "application/json",
				extension: "json",
			},
			value: value.value,
		},
	};
}

async function latestPayloadCandidate(
	store: PayloadStore,
	descriptor: string,
	role: JsonPayloadRole,
): Promise<PayloadResult<PayloadCandidate>> {
	let entries: readonly string[];
	try {
		entries = await readdir(store.payloadDir);
	} catch (error) {
		return payloadError("payload_lookup_failed", `Failed to scan payload session ${store.sessionId} at ${store.payloadDir}: ${errorMessage(error)}`);
	}
	let latest: PayloadCandidate | null = null;
	for (const filename of entries) {
		const match = PAYLOAD_FILENAME_PATTERN.exec(filename);
		const groups = match?.groups;
		if (groups?.sequence === undefined || groups.descriptor === undefined || groups.role === undefined || groups.extension === undefined) continue;
		if (groups.descriptor !== descriptor || groups.role !== role || groups.extension !== "json") continue;
		const candidate = {
			filename,
			sequence: Number(groups.sequence),
			createdAtUtc: createdAtUtcFromFilenameTimestamp(filename.slice(0, 16)),
		};
		if (latest === null || candidate.sequence > latest.sequence) latest = candidate;
	}
	if (latest === null) {
		return payloadError(
			"payload_lookup_failed",
			`No JSON payload artifact found in session ${store.sessionId} for descriptor ${descriptor}, role ${role}, extension json.`,
		);
	}
	return { type: "ok", value: latest };
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

function createdAtUtcFromFilenameTimestamp(value: string): string {
	return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
