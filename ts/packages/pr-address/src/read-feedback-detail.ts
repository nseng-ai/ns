import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { clinkrFailure, clinkrOk } from "./clinkr-envelope.ts";
import { hasFlag, parseManagedOptions } from "./managed-options.ts";
import type { ExecOperationDispatchResult, ExecOperationInvocation } from "./operation-registry.ts";

type DetailKind = "review" | "review_body" | "review_thread" | "thread_comment" | "thread_comment_body" | "discussion_comment" | "discussion_comment_body";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const DETAIL_KIND_PATTERNS: ReadonlyArray<{ pattern: RegExp; detailKind: DetailKind }> = [
	{ pattern: /^\/data\/reviews\/(0|[1-9][0-9]*)$/, detailKind: "review" },
	{ pattern: /^\/data\/reviews\/(0|[1-9][0-9]*)\/body$/, detailKind: "review_body" },
	{ pattern: /^\/data\/review_threads\/(0|[1-9][0-9]*)$/, detailKind: "review_thread" },
	{ pattern: /^\/data\/review_threads\/(0|[1-9][0-9]*)\/comments\/(0|[1-9][0-9]*)$/, detailKind: "thread_comment" },
	{ pattern: /^\/data\/review_threads\/(0|[1-9][0-9]*)\/comments\/(0|[1-9][0-9]*)\/body$/, detailKind: "thread_comment_body" },
	{ pattern: /^\/data\/discussion_comments\/(0|[1-9][0-9]*)$/, detailKind: "discussion_comment" },
	{ pattern: /^\/data\/discussion_comments\/(0|[1-9][0-9]*)\/body$/, detailKind: "discussion_comment_body" },
];

export async function runReadFeedbackDetailOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	if (hasFlag(invocation.args, "--json-schema")) return { type: "fallback" };
	const options = parseManagedOptions(invocation.args, ["--payload-path", "--json-pointer"]);
	if (options.type === "error") return { type: "exit", exit: clinkrFailure("invalid_request", options.message) };
	const payloadPath = options.options.values.get("--payload-path");
	const jsonPointer = options.options.values.get("--json-pointer");
	if (payloadPath === undefined) return { type: "exit", exit: clinkrFailure("invalid_request", "--payload-path requires a value.") };
	if (jsonPointer === undefined) return { type: "exit", exit: clinkrFailure("invalid_request", "--json-pointer requires a value.") };
	const result = await readFeedbackDetail({ payloadPath, jsonPointer });
	if (result.type === "error") return { type: "exit", exit: clinkrFailure(result.errorType, result.message) };
	return { type: "exit", exit: clinkrOk(result.value) };
}

export async function readFeedbackDetail(options: { payloadPath: string; jsonPointer: string }): Promise<{ type: "ok"; value: unknown } | { type: "error"; errorType: string; message: string }> {
	const detailKind = detailKindForPointer(options.jsonPointer);
	if (detailKind === null) return { type: "error", errorType: "invalid_request", message: `JSON Pointer is not an allowed PR feedback detail locator: ${pythonRepr(options.jsonPointer)}` };
	if (!basename(options.payloadPath).endsWith(".raw.json")) {
		return { type: "error", errorType: "payload_lookup_failed", message: `Payload artifact is not an allowed raw payload: ${options.payloadPath}` };
	}
	const envelopeResult = await readJsonFile(options.payloadPath);
	if (envelopeResult.type === "error") return envelopeResult;
	const envelope = envelopeResult.value;
	if (!isRecord(envelope)) return { type: "error", errorType: "payload_lookup_failed", message: `Raw payload artifact must contain a Clinkr envelope object: ${options.payloadPath}` };
	if (envelope.exit_code !== 0) return { type: "error", errorType: "payload_lookup_failed", message: `Raw payload artifact must be a successful Clinkr envelope: ${options.payloadPath}` };
	if (!("data" in envelope)) return { type: "error", errorType: "payload_lookup_failed", message: `Raw payload artifact is missing Clinkr data: ${options.payloadPath}` };
	const valueResult = resolveJsonPointer(envelope, options.jsonPointer);
	if (valueResult.type === "error") return { type: "error", errorType: "payload_lookup_failed", message: valueResult.message };
	const value = valueResult.value;
	if (detailKind.endsWith("_body")) {
		if (typeof value !== "string") return { type: "error", errorType: "payload_lookup_failed", message: `Feedback body locator resolved to non-string value in ${options.payloadPath}: ${options.jsonPointer}` };
	} else if (!isRecord(value)) {
		return { type: "error", errorType: "payload_lookup_failed", message: `Feedback item locator resolved to non-object value in ${options.payloadPath}: ${options.jsonPointer}` };
	}
	return { type: "ok", value: { payload_path: options.payloadPath, json_pointer: options.jsonPointer, detail_kind: detailKind, value } };
}

async function readJsonFile(path: string): Promise<{ type: "ok"; value: JsonValue } | { type: "error"; errorType: string; message: string }> {
	try {
		const parsedJson: unknown = JSON.parse(await readFile(path, "utf8"));
		if (!isJsonValue(parsedJson)) return { type: "error", errorType: "payload_lookup_failed", message: `Raw payload artifact must contain JSON data: ${path}` };
		return { type: "ok", value: parsedJson };
	} catch (error) {
		return { type: "error", errorType: "payload_lookup_failed", message: error instanceof Error ? error.message : String(error) };
	}
}

function detailKindForPointer(pointer: string): DetailKind | null {
	for (const item of DETAIL_KIND_PATTERNS) {
		if (item.pattern.test(pointer)) return item.detailKind;
	}
	return null;
}

function resolveJsonPointer(document: JsonValue, pointer: string): { type: "ok"; value: JsonValue } | { type: "error"; message: string } {
	if (pointer === "") return { type: "ok", value: document };
	if (!pointer.startsWith("/")) return { type: "error", message: `Invalid JSON Pointer: ${pointer}` };
	let current: JsonValue = document;
	for (const rawPart of pointer.slice(1).split("/")) {
		const part = rawPart.replaceAll("~1", "/").replaceAll("~0", "~");
		if (Array.isArray(current)) {
			if (!/^(0|[1-9][0-9]*)$/.test(part)) return { type: "error", message: `Invalid array index in JSON Pointer: ${pointer}` };
			const index = Number(part);
			const next = current[index];
			if (next === undefined) return { type: "error", message: `JSON Pointer not found: ${pointer}` };
			current = next;
		} else if (isRecord(current)) {
			if (!(part in current)) return { type: "error", message: `JSON Pointer not found: ${pointer}` };
			current = current[part] ?? null;
		} else {
			return { type: "error", message: `JSON Pointer not found: ${pointer}` };
		}
	}
	return { type: "ok", value: current };
}

function isRecord(value: unknown): value is { [key: string]: JsonValue } {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
	if (value === null) return true;
	if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return true;
	if (Array.isArray(value)) return value.every(isJsonValue);
	if (!isRecord(value)) return false;
	return Object.values(value).every(isJsonValue);
}

function pythonRepr(value: string): string {
	return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}
