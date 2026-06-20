/**
 * Lookup helpers for JSON payload artifacts.
 */

import { lstatSync, readFileSync, type Stats } from "node:fs";
import { basename, dirname, isAbsolute } from "node:path";

import { PayloadError } from "./errors.ts";
import { PAYLOAD_FILENAME_PATTERN } from "./filename.ts";
import { isSafeSegment } from "./segments.ts";

const DEFAULT_JSON_PAYLOAD_ROLES = new Set(["raw", "summary"]);

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };

export function resolveJsonPointer(document: JsonValue, pointer: string): JsonValue {
	if (pointer === "") {
		return document;
	}
	if (!pointer.startsWith("/")) {
		throw new PayloadError(
			"payload_lookup_failed",
			`JSON Pointer must be empty or start with '/': ${JSON.stringify(pointer)}`,
		);
	}

	let current: JsonValue = document;
	const tokens = pointer.split("/").slice(1);
	for (const rawToken of tokens) {
		const token = unescapePointerToken(rawToken, pointer);
		if (current === null || typeof current !== "object") {
			throw new PayloadError(
				"payload_lookup_failed",
				`JSON Pointer cannot traverse scalar value at token ${JSON.stringify(token)}: ${JSON.stringify(pointer)}`,
			);
		}
		if (Array.isArray(current)) {
			const index = arrayIndexForToken(token, pointer);
			if (index >= current.length) {
				throw new PayloadError(
					"payload_lookup_failed",
					`JSON Pointer array index ${index} is out of range for array of length ${current.length}: ${JSON.stringify(pointer)}`,
				);
			}
			const arrValue = current[index];
			if (arrValue === undefined) {
				throw new PayloadError(
					"payload_lookup_failed",
					`JSON Pointer array index ${index} is undefined: ${JSON.stringify(pointer)}`,
				);
			}
			current = arrValue;
			continue;
		}
		// Object case
		const obj = current as { readonly [key: string]: JsonValue };
		if (!(token in obj)) {
			throw new PayloadError(
				"payload_lookup_failed",
				`JSON Pointer token ${JSON.stringify(token)} was not found in object: ${JSON.stringify(pointer)}`,
			);
		}
		const objValue = obj[token];
		if (objValue === undefined) {
			throw new PayloadError(
				"payload_lookup_failed",
				`JSON Pointer token ${JSON.stringify(token)} is undefined: ${JSON.stringify(pointer)}`,
			);
		}
		current = objValue;
	}
	return current;
}

export function readJsonPayloadArtifact(
	payloadPath: string,
	options: { allowedRoles?: ReadonlySet<string> } = {},
): JsonValue {
	const roles = options.allowedRoles ?? DEFAULT_JSON_PAYLOAD_ROLES;
	validateJsonPayloadArtifactPath(payloadPath, { allowedRoles: roles });
	let content: string;
	try {
		content = readFileSync(payloadPath, "utf-8");
	} catch (error) {
		throw new PayloadError(
			"payload_lookup_failed",
			`Failed to read payload artifact ${payloadPath}: ${String(error)}`,
			error,
		);
	}
	try {
		return JSON.parse(content) as JsonValue;
	} catch (error) {
		throw new PayloadError(
			"payload_lookup_failed",
			`Failed to parse JSON payload artifact ${payloadPath}: ${String(error)}`,
			error,
		);
	}
}

export function readJsonPayloadArtifactValue(
	payloadPath: string,
	pointer: string,
	options: { allowedRoles?: ReadonlySet<string> } = {},
): JsonValue {
	const document = readJsonPayloadArtifact(payloadPath, options);
	return resolveJsonPointer(document, pointer);
}

function unescapePointerToken(token: string, pointer: string): string {
	const result: string[] = [];
	let index = 0;
	while (index < token.length) {
		const char = token[index];
		if (char === undefined) break;
		if (char !== "~") {
			result.push(char);
			index += 1;
			continue;
		}
		const escapeIndex = index + 1;
		if (escapeIndex >= token.length) {
			throw new PayloadError(
				"payload_lookup_failed",
				`Invalid JSON Pointer escape in ${JSON.stringify(pointer)}: trailing '~'`,
			);
		}
		const escapeChar = token[escapeIndex];
		if (escapeChar === undefined) break;
		if (escapeChar === "0") {
			result.push("~");
		} else if (escapeChar === "1") {
			result.push("/");
		} else {
			throw new PayloadError(
				"payload_lookup_failed",
				`Invalid JSON Pointer escape '~${escapeChar}' in ${JSON.stringify(pointer)}`,
			);
		}
		index += 2;
	}
	return result.join("");
}

function arrayIndexForToken(token: string, pointer: string): number {
	if (token === "-") {
		throw new PayloadError(
			"payload_lookup_failed",
			`JSON Pointer '-' token is not a valid array index: ${JSON.stringify(pointer)}`,
		);
	}
	if (token === "0") {
		return 0;
	}
	if (token.startsWith("0")) {
		throw new PayloadError(
			"payload_lookup_failed",
			`JSON Pointer array index must not contain leading zeroes: ${JSON.stringify(pointer)}`,
		);
	}
	if (!/^\d+$/.test(token)) {
		throw new PayloadError(
			"payload_lookup_failed",
			`JSON Pointer array token is not a non-negative integer: ${JSON.stringify(pointer)}`,
		);
	}
	return Number.parseInt(token, 10);
}

function validateJsonPayloadArtifactPath(
	payloadPath: string,
	options: { allowedRoles: ReadonlySet<string> },
): void {
	if (!isAbsolute(payloadPath)) {
		throw new PayloadError(
			"payload_lookup_failed",
			`Payload artifact path must be absolute: ${payloadPath}`,
		);
	}
	let stats: Stats;
	try {
		stats = lstatSync(payloadPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new PayloadError(
				"payload_lookup_failed",
				`Payload artifact path does not exist: ${payloadPath}`,
			);
		}
		throw new PayloadError(
			"payload_lookup_failed",
			`Failed to stat payload artifact path: ${payloadPath}`,
			error,
		);
	}
	if (stats.isSymbolicLink()) {
		throw new PayloadError(
			"payload_lookup_failed",
			`Payload artifact path must not be a symlink: ${payloadPath}`,
		);
	}
	if (!stats.isFile()) {
		throw new PayloadError(
			"payload_lookup_failed",
			`Payload artifact path must be a regular file: ${payloadPath}`,
		);
	}
	if (basename(dirname(payloadPath)) !== "payloads") {
		throw new PayloadError(
			"payload_lookup_failed",
			`Payload artifact must live under a payloads directory: ${payloadPath}`,
		);
	}

	const sessionId = basename(dirname(dirname(payloadPath)));
	if (!isSafeSegment(sessionId)) {
		throw new PayloadError(
			"payload_lookup_failed",
			`Payload artifact session id must be a safe segment: ${JSON.stringify(sessionId)}`,
		);
	}
	if (basename(dirname(dirname(dirname(payloadPath)))) !== "sessions") {
		throw new PayloadError(
			"payload_lookup_failed",
			`Payload artifact must live under sessions/<session-id>/payloads: ${payloadPath}`,
		);
	}

	const filename = basename(payloadPath);
	const match = PAYLOAD_FILENAME_PATTERN.exec(filename);
	if (match === null || match.groups === undefined) {
		throw new PayloadError(
			"payload_lookup_failed",
			`Payload artifact filename does not match payload contract: ${filename}`,
		);
	}
	const role = match.groups.role as string | undefined;
	if (!role || !options.allowedRoles.has(role)) {
		throw new PayloadError(
			"payload_lookup_failed",
			`Payload artifact role ${JSON.stringify(role ?? "")} is not allowed for this lookup: ${payloadPath}`,
		);
	}
	const extension = match.groups.extension as string | undefined;
	if (extension !== "json") {
		throw new PayloadError(
			"payload_lookup_failed",
			`Payload artifact extension must be json: ${payloadPath}`,
		);
	}
}
