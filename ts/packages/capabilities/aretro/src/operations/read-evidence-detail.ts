import { failure, ok } from "@ji/clinkr";
import { z } from "zod";

import type { AretroCliContext } from "../context.ts";
import { PayloadError } from "../payloads/errors.ts";
import { readJsonPayloadArtifact, resolveJsonPointer, type JsonValue } from "../payloads/lookup.ts";

export const readEvidenceDetailRequestSchema = z.object({
	payloadPath: z.string(),
	jsonPointer: z.string(),
});

export type ReadEvidenceDetailRequest = z.infer<typeof readEvidenceDetailRequestSchema>;

export const detailValueBoundsSchema = z.object({
	jsonPointer: z.string(),
	valueKind: z.enum(["null", "boolean", "number", "string", "array", "object"]),
	childCount: z.number().nullable(),
	estimatedJsonBytes: z.number().nullable(),
	isBroadPointer: z.boolean(),
	isComplete: z.literal(true),
	narrowingGuidance: z.string().nullable(),
});

export const readEvidenceDetailResultSchema = z.object({
	payloadPath: z.string(),
	jsonPointer: z.string(),
	value: z.unknown(),
	valueBounds: detailValueBoundsSchema,
});

export type ReadEvidenceDetailResult = z.infer<typeof readEvidenceDetailResultSchema>;

export async function runReadEvidenceDetail(
	_context: AretroCliContext,
	request: ReadEvidenceDetailRequest,
) {
	const pointerError = dataPointerError(request.jsonPointer);
	if (pointerError !== null) {
		return failure("invalid-request", pointerError);
	}

	let envelope: JsonValue;
	try {
		envelope = readRawPayloadEnvelope(request.payloadPath);
		validateSuccessEnvelope(envelope, request.payloadPath);
		validatePayloadData(envelope, request.payloadPath);
	} catch (error) {
		return failureForPayloadError(error);
	}

	let value: JsonValue;
	try {
		value = resolveDetailValue(envelope, request.jsonPointer);
	} catch (error) {
		return failureForPayloadError(error);
	}

	return ok({
		payloadPath: request.payloadPath,
		jsonPointer: request.jsonPointer,
		value,
		valueBounds: valueBoundsFor(request.jsonPointer, value),
	});
}

export function renderReadEvidenceDetail(result: ReadEvidenceDetailResult): string {
	return JSON.stringify(result, null, 2);
}

function dataPointerError(pointer: string): string | null {
	if (pointer === "/data" || pointer.startsWith("/data/")) {
		return null;
	}
	return `JSON Pointer must target the payload data document under /data: ${JSON.stringify(pointer)}`;
}

function readRawPayloadEnvelope(payloadPath: string): JsonValue {
	const document = readJsonPayloadArtifact(payloadPath, { allowedRoles: new Set(["raw"]) });
	if (typeof document !== "object" || document === null || Array.isArray(document)) {
		throw new PayloadError(
			"payload-lookup-failed",
			`Raw payload artifact must contain a Clinkr envelope object: ${payloadPath}`,
		);
	}
	return document;
}

function validateSuccessEnvelope(envelope: JsonValue, payloadPath: string): void {
	if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
		throw new PayloadError("payload-lookup-failed", `Invalid envelope: ${payloadPath}`);
	}
	const exitCode = (envelope as Record<string, unknown>).exitCode;
	if (typeof exitCode !== "number" || exitCode !== 0) {
		throw new PayloadError(
			"payload-lookup-failed",
			`Raw payload artifact must be a successful Clinkr envelope: ${payloadPath}`,
		);
	}
	if (!("data" in (envelope as Record<string, unknown>))) {
		throw new PayloadError(
			"payload-lookup-failed",
			`Raw payload artifact is missing Clinkr data: ${payloadPath}`,
		);
	}
}

function validatePayloadData(envelope: JsonValue, payloadPath: string): void {
	if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
		throw new PayloadError("payload-lookup-failed", `Invalid envelope: ${payloadPath}`);
	}
	const data = (envelope as Record<string, unknown>).data;
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		throw new PayloadError(
			"payload-lookup-failed",
			`Raw payload artifact data must be an aretro detail object: ${payloadPath}`,
		);
	}
	const schemaVersion = (data as Record<string, unknown>).schemaVersion;
	if (typeof schemaVersion !== "number") {
		throw new PayloadError(
			"payload-lookup-failed",
			`Raw payload artifact data is missing a supported schema version: ${payloadPath}`,
		);
	}
	if (schemaVersion !== 1) {
		throw new PayloadError(
			"payload-lookup-failed",
			`Raw payload artifact schema version is unsupported: ${payloadPath}`,
		);
	}
}

function resolveDetailValue(envelope: JsonValue, pointer: string): JsonValue {
	return resolveJsonPointer(envelope, pointer);
}

function valueBoundsFor(
	jsonPointer: string,
	value: JsonValue,
): z.infer<typeof detailValueBoundsSchema> {
	const isBroadPointer = isBroadDetailPointer(jsonPointer, value);
	return {
		jsonPointer,
		valueKind: valueKind(value),
		childCount: childCount(value),
		estimatedJsonBytes: estimatedJsonBytes(value),
		isBroadPointer,
		isComplete: true,
		narrowingGuidance: isBroadPointer
			? "This pointer selects a broad container. Prefer a narrower /data/... pointer such as /data/sessions/0, /data/sessions/0/toolCalls, or /data/evidenceItems/0/supportingEventPointers."
			: null,
	};
}

function valueKind(value: JsonValue): z.infer<typeof detailValueBoundsSchema>["valueKind"] {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	const type = typeof value;
	if (type === "boolean" || type === "number" || type === "string") return type;
	return "object";
}

function childCount(value: JsonValue): number | null {
	if (Array.isArray(value)) return value.length;
	if (typeof value === "object" && value !== null) return Object.keys(value).length;
	return null;
}

function estimatedJsonBytes(value: JsonValue): number | null {
	try {
		return JSON.stringify(value).length;
	} catch {
		// Treat unexpected boundary values that cannot stringify as unknown size.
		return null;
	}
}

function isBroadDetailPointer(jsonPointer: string, value: JsonValue): boolean {
	if (
		jsonPointer === "/data" ||
		jsonPointer === "/data/sessions" ||
		jsonPointer === "/data/evidenceItems"
	) {
		return true;
	}
	return childCount(value) !== null && jsonPointer.split("/").length <= 3;
}

function failureForPayloadError(error: unknown) {
	const payloadError = error instanceof PayloadError ? error : null;
	return failure(
		payloadError?.errorType ?? "payload-lookup-failed",
		payloadError?.message ?? String(error),
	);
}
