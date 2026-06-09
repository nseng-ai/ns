import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { z } from "zod";

import { clinkrFailure, clinkrOk } from "./clinkr-envelope.ts";
import { loadJsonInput } from "./json-input.ts";
import { parseManagedOptions } from "./managed-options.ts";
import { readJsonPayloadArtifact, resolveJsonPointer as resolvePayloadJsonPointer } from "./payload-lookup.ts";
import { PayloadStore, type PayloadClock, type PayloadReference } from "./payload-store.ts";
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

const readFeedbackDetailsSelectionSchema = z.looseObject({
	payload_path: z.string(),
	json_pointers: z.array(z.string()),
});

type ReadFeedbackDetailsSelection = z.infer<typeof readFeedbackDetailsSelectionSchema>;

type ValueKind = "string" | "object";

const RAW_PAYLOAD_ROLES: ReadonlySet<string> = new Set(["raw"]);

interface SelectedFeedbackDetail {
	json_pointer: string;
	detail_kind: DetailKind;
	value: unknown;
}

interface SelectedFeedbackDetailSummary {
	json_pointer: string;
	detail_kind: DetailKind;
	artifact_json_pointer: string;
	value_kind: ValueKind;
	value_chars: number | null;
	body_chars: number | null;
	object_keys: string[] | null;
}

interface ReadFeedbackDetailsResult {
	payload_path: string;
	selected_payload_reference: PayloadReference;
	details: SelectedFeedbackDetailSummary[];
	counts: { requested: number; selected: number; body_values: number; item_values: number };
}

type ReadFeedbackDetailsOutcome = { type: "ok"; value: ReadFeedbackDetailsResult } | { type: "error"; errorType: string; message: string };

export async function runReadFeedbackDetailsOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	const options = parseManagedOptions(invocation.args, ["--selection-json"]);
	if (options.type === "error") return { type: "exit", exit: clinkrFailure("invalid_request", options.message) };
	const selectionResult = await loadJsonInput({
		optionValue: options.options.values.get("--selection-json"),
		commandName: "read-feedback-details",
		inputDescription: "selection JSON",
		optionName: "--selection-json",
		schema: readFeedbackDetailsSelectionSchema,
		stdin: invocation.deps.stdin,
	});
	if (selectionResult.type === "error") return { type: "exit", exit: clinkrFailure(selectionResult.error.errorType, selectionResult.error.message) };
	const result = await readFeedbackDetails({ selection: selectionResult.value, clock: invocation.deps.context.payloadClock });
	if (result.type === "error") return { type: "exit", exit: clinkrFailure(result.errorType, result.message) };
	return { type: "exit", exit: clinkrOk(result.value) };
}

export async function readFeedbackDetails(options: { selection: ReadFeedbackDetailsSelection; clock?: PayloadClock | undefined }): Promise<ReadFeedbackDetailsOutcome> {
	const selection = options.selection;
	if (selection.json_pointers.length === 0) {
		return { type: "error", errorType: "invalid_request", message: "read-feedback-details selection must include at least one JSON Pointer" };
	}
	const duplicatePointer = firstDuplicatePointer(selection.json_pointers);
	if (duplicatePointer !== null) {
		return { type: "error", errorType: "invalid_request", message: `Duplicate JSON Pointer in read-feedback-details selection: ${duplicatePointer}` };
	}

	// Mirror Python ordering: validate every pointer's detail kind before reading the artifact.
	const locators: Array<{ pointer: string; detailKind: DetailKind }> = [];
	for (const pointer of selection.json_pointers) {
		const detailKind = detailKindForPointer(pointer);
		if (detailKind === null) {
			return { type: "error", errorType: "invalid_request", message: `JSON Pointer is not an allowed PR feedback detail locator: ${pythonRepr(pointer)}` };
		}
		locators.push({ pointer, detailKind });
	}

	const envelopeResult = await readRawClinkrEnvelope(selection.payload_path);
	if (envelopeResult.type === "error") return envelopeResult;
	const envelope = envelopeResult.value;

	const selected: SelectedFeedbackDetail[] = [];
	for (const { pointer, detailKind } of locators) {
		const valueResult = resolvePayloadJsonPointer(envelope, pointer);
		if (valueResult.type === "error") return { type: "error", errorType: valueResult.errorType, message: valueResult.message };
		const typeError = detailValueTypeError({ value: valueResult.value, detailKind, payloadPath: selection.payload_path, jsonPointer: pointer });
		if (typeError !== null) return typeError;
		selected.push({ json_pointer: pointer, detail_kind: detailKind, value: valueResult.value });
	}

	const referenceResult = await writeSelectedDetailsArtifact({ sourcePayloadPath: selection.payload_path, selected, clock: options.clock });
	if (referenceResult.type === "error") return { type: "error", errorType: referenceResult.errorType, message: referenceResult.message };

	const summaries = selected.map(detailSummary);
	return {
		type: "ok",
		value: {
			payload_path: selection.payload_path,
			selected_payload_reference: referenceResult.value,
			details: summaries,
			counts: {
				requested: selection.json_pointers.length,
				selected: summaries.length,
				body_values: summaries.filter((summary) => summary.value_kind === "string").length,
				item_values: summaries.filter((summary) => summary.value_kind === "object").length,
			},
		},
	};
}

async function readRawClinkrEnvelope(payloadPath: string): Promise<{ type: "ok"; value: Record<string, unknown> } | { type: "error"; errorType: string; message: string }> {
	const documentResult = await readJsonPayloadArtifact(payloadPath, { allowedRoles: RAW_PAYLOAD_ROLES });
	if (documentResult.type === "error") return { type: "error", errorType: documentResult.errorType, message: documentResult.message };
	const document = documentResult.value;
	if (!isRecord(document)) {
		return { type: "error", errorType: "payload_lookup_failed", message: `Raw payload artifact must contain a Clinkr envelope object: ${payloadPath}` };
	}
	const exitCode = document.exit_code;
	if (typeof exitCode !== "number" || exitCode !== 0) {
		return { type: "error", errorType: "payload_lookup_failed", message: `Raw payload artifact must be a successful Clinkr envelope: ${payloadPath}` };
	}
	if (!("data" in document)) {
		return { type: "error", errorType: "payload_lookup_failed", message: `Raw payload artifact is missing Clinkr data: ${payloadPath}` };
	}
	return { type: "ok", value: document };
}

function detailValueTypeError(options: { value: unknown; detailKind: DetailKind; payloadPath: string; jsonPointer: string }): ReadFeedbackDetailsOutcome | null {
	if (options.detailKind.endsWith("_body")) {
		if (typeof options.value !== "string") {
			return {
				type: "error",
				errorType: "payload_lookup_failed",
				message: `Feedback body locator resolved to non-string value in ${options.payloadPath}: ${options.jsonPointer}`,
			};
		}
		return null;
	}
	if (!isRecord(options.value)) {
		return {
			type: "error",
			errorType: "payload_lookup_failed",
			message: `Feedback item locator resolved to non-object value in ${options.payloadPath}: ${options.jsonPointer}`,
		};
	}
	return null;
}

async function writeSelectedDetailsArtifact(options: {
	sourcePayloadPath: string;
	selected: readonly SelectedFeedbackDetail[];
	clock: PayloadClock | undefined;
}): Promise<{ type: "ok"; value: PayloadReference } | { type: "error"; errorType: string; message: string }> {
	const storeResult = await PayloadStore.openContainingArtifact(options.sourcePayloadPath, { clock: options.clock });
	if (storeResult.type === "error") return { type: "error", errorType: storeResult.errorType, message: storeResult.message };
	const reference = await storeResult.value.writeJsonArtifact({
		descriptor: "pr-address-selected-feedback-details",
		role: "summary",
		payload: {
			source_payload_path: options.sourcePayloadPath,
			details: options.selected,
		},
	});
	if (reference.type === "error") return { type: "error", errorType: reference.errorType, message: reference.message };
	return { type: "ok", value: reference.value };
}

function detailSummary(selected: SelectedFeedbackDetail, index: number): SelectedFeedbackDetailSummary {
	const artifactJsonPointer = `/details/${index}/value`;
	if (typeof selected.value === "string") {
		return {
			json_pointer: selected.json_pointer,
			detail_kind: selected.detail_kind,
			artifact_json_pointer: artifactJsonPointer,
			value_kind: "string",
			value_chars: selected.value.length,
			body_chars: selected.value.length,
			object_keys: null,
		};
	}
	// Non-string selected values were already validated as objects.
	const value = selected.value as { [key: string]: JsonValue };
	const body = value.body;
	return {
		json_pointer: selected.json_pointer,
		detail_kind: selected.detail_kind,
		artifact_json_pointer: artifactJsonPointer,
		value_kind: "object",
		value_chars: null,
		body_chars: typeof body === "string" ? body.length : null,
		object_keys: Object.keys(value).sort(),
	};
}

function firstDuplicatePointer(pointers: readonly string[]): string | null {
	const seen = new Set<string>();
	for (const pointer of pointers) {
		if (seen.has(pointer)) return pointer;
		seen.add(pointer);
	}
	return null;
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
