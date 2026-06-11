import { readFile } from "node:fs/promises";

import { formatErrorMessage } from "@asdl/core";
import { payloadError, pythonRepr, validateContainedArtifactPath, type PayloadResult } from "./payload-store.ts";

const DEFAULT_JSON_PAYLOAD_ROLES: ReadonlySet<string> = new Set(["raw", "summary"]);

/** Resolve an RFC 6901 JSON Pointer against a parsed JSON document. */
export function resolveJsonPointer(document: unknown, pointer: string): PayloadResult<unknown> {
	if (pointer === "") return { type: "ok", value: document };
	if (!pointer.startsWith("/")) {
		return payloadError("payload_lookup_failed", `JSON Pointer must be empty or start with '/': ${pythonRepr(pointer)}`);
	}

	let current: unknown = document;
	for (const rawToken of pointer.split("/").slice(1)) {
		const token = unescapePointerToken(rawToken, pointer);
		if (token.type === "error") return token;
		if (isJsonObject(current)) {
			// Object.hasOwn mirrors Python dict membership; the `in` operator would also match prototype keys.
			if (!Object.hasOwn(current, token.value)) {
				return payloadError("payload_lookup_failed", `JSON Pointer token ${pythonRepr(token.value)} was not found in object: ${pythonRepr(pointer)}`);
			}
			current = current[token.value];
			continue;
		}
		if (Array.isArray(current)) {
			const index = arrayIndexForToken(token.value, pointer);
			if (index.type === "error") return index;
			if (index.value >= current.length) {
				return payloadError(
					"payload_lookup_failed",
					`JSON Pointer array index ${index.value} is out of range for array of length ${current.length}: ${pythonRepr(pointer)}`,
				);
			}
			current = current[index.value];
			continue;
		}
		return payloadError("payload_lookup_failed", `JSON Pointer cannot traverse scalar value at token ${pythonRepr(token.value)}: ${pythonRepr(pointer)}`);
	}
	return { type: "ok", value: current };
}

/** Validate and load a JSON payload artifact from an explicit absolute path. */
export async function readJsonPayloadArtifact(
	payloadPath: string,
	options: { allowedRoles?: ReadonlySet<string> | undefined } = {},
): Promise<PayloadResult<unknown>> {
	const allowedRoles = options.allowedRoles ?? DEFAULT_JSON_PAYLOAD_ROLES;
	const validated = await validateContainedArtifactPath(payloadPath);
	if (validated.type === "error") return validated;
	if (!allowedRoles.has(validated.value.role)) {
		return payloadError("payload_lookup_failed", `Payload artifact role ${pythonRepr(validated.value.role)} is not allowed for this lookup: ${payloadPath}`);
	}
	if (validated.value.extension !== "json") {
		return payloadError("payload_lookup_failed", `Payload artifact extension must be json: ${payloadPath}`);
	}

	let artifactText: string;
	try {
		artifactText = await readFile(payloadPath, "utf8");
	} catch (error) {
		return payloadError("payload_lookup_failed", `Failed to read payload artifact ${payloadPath}: ${formatErrorMessage(error)}`);
	}
	try {
		return { type: "ok", value: JSON.parse(artifactText) as unknown };
	} catch (error) {
		return payloadError("payload_lookup_failed", `Failed to parse JSON payload artifact ${payloadPath}: ${formatErrorMessage(error)}`);
	}
}

/** Read one JSON Pointer value from a validated payload artifact. */
export async function readJsonPayloadArtifactValue(
	payloadPath: string,
	pointer: string,
	options: { allowedRoles?: ReadonlySet<string> | undefined } = {},
): Promise<PayloadResult<unknown>> {
	const document = await readJsonPayloadArtifact(payloadPath, options);
	if (document.type === "error") return document;
	return resolveJsonPointer(document.value, pointer);
}

function unescapePointerToken(token: string, pointer: string): PayloadResult<string> {
	const result: string[] = [];
	let index = 0;
	while (index < token.length) {
		const character = token[index] as string;
		if (character !== "~") {
			result.push(character);
			index += 1;
			continue;
		}
		const escapeCharacter = token[index + 1];
		if (escapeCharacter === undefined) {
			return payloadError("payload_lookup_failed", `Invalid JSON Pointer escape in ${pythonRepr(pointer)}: trailing '~'`);
		}
		if (escapeCharacter === "0") result.push("~");
		else if (escapeCharacter === "1") result.push("/");
		else return payloadError("payload_lookup_failed", `Invalid JSON Pointer escape '~${escapeCharacter}' in ${pythonRepr(pointer)}`);
		index += 2;
	}
	return { type: "ok", value: result.join("") };
}

function arrayIndexForToken(token: string, pointer: string): PayloadResult<number> {
	if (token === "-") {
		return payloadError("payload_lookup_failed", `JSON Pointer '-' token is not a valid array index: ${pythonRepr(pointer)}`);
	}
	if (token === "0") return { type: "ok", value: 0 };
	if (token.startsWith("0")) {
		return payloadError("payload_lookup_failed", `JSON Pointer array index must not contain leading zeroes: ${pythonRepr(pointer)}`);
	}
	if (!/^[0-9]+$/.test(token)) {
		return payloadError("payload_lookup_failed", `JSON Pointer array token is not a non-negative integer: ${pythonRepr(pointer)}`);
	}
	return { type: "ok", value: Number(token) };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
