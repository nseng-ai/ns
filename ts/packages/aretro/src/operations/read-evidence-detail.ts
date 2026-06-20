import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { AretroCliContext } from "../context.ts";
import { PayloadError } from "../payloads/errors.ts";
import { readJsonPayloadArtifact, resolveJsonPointer, type JsonValue } from "../payloads/lookup.ts";

export const readEvidenceDetailRequestSchema = z.object({
	payloadPath: z.string(),
	jsonPointer: z.string(),
});

export type ReadEvidenceDetailRequest = z.infer<typeof readEvidenceDetailRequestSchema>;

export const readEvidenceDetailResultSchema = z.object({
	payload_path: z.string(),
	json_pointer: z.string(),
	value: z.unknown(),
});

export type ReadEvidenceDetailResult = z.infer<typeof readEvidenceDetailResultSchema>;

export async function runReadEvidenceDetail(
	_context: AretroCliContext,
	request: ReadEvidenceDetailRequest,
) {
	const pointerError = dataPointerError(request.jsonPointer);
	if (pointerError !== null) {
		return failure("invalid_request", pointerError);
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
		payload_path: request.payloadPath,
		json_pointer: request.jsonPointer,
		value,
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
			"payload_lookup_failed",
			`Raw payload artifact must contain a Clinkr envelope object: ${payloadPath}`,
		);
	}
	return document;
}

function validateSuccessEnvelope(envelope: JsonValue, payloadPath: string): void {
	if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
		throw new PayloadError("payload_lookup_failed", `Invalid envelope: ${payloadPath}`);
	}
	const exitCode = (envelope as Record<string, unknown>).exit_code;
	if (typeof exitCode !== "number" || exitCode !== 0) {
		throw new PayloadError(
			"payload_lookup_failed",
			`Raw payload artifact must be a successful Clinkr envelope: ${payloadPath}`,
		);
	}
	if (!("data" in (envelope as Record<string, unknown>))) {
		throw new PayloadError(
			"payload_lookup_failed",
			`Raw payload artifact is missing Clinkr data: ${payloadPath}`,
		);
	}
}

function validatePayloadData(envelope: JsonValue, payloadPath: string): void {
	if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
		throw new PayloadError("payload_lookup_failed", `Invalid envelope: ${payloadPath}`);
	}
	const data = (envelope as Record<string, unknown>).data;
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		throw new PayloadError(
			"payload_lookup_failed",
			`Raw payload artifact data must be an aretro detail object: ${payloadPath}`,
		);
	}
	const schemaVersion = (data as Record<string, unknown>).schema_version;
	if (typeof schemaVersion !== "number") {
		throw new PayloadError(
			"payload_lookup_failed",
			`Raw payload artifact data is missing a supported schema version: ${payloadPath}`,
		);
	}
	if (schemaVersion !== 1) {
		throw new PayloadError(
			"payload_lookup_failed",
			`Raw payload artifact schema version is unsupported: ${payloadPath}`,
		);
	}
}

function resolveDetailValue(envelope: JsonValue, pointer: string): JsonValue {
	return resolveJsonPointer(envelope, pointer);
}

function failureForPayloadError(error: unknown) {
	const payloadError = error instanceof PayloadError ? error : null;
	return failure(
		payloadError?.errorType ?? "payload_lookup_failed",
		payloadError?.message ?? String(error),
	);
}
