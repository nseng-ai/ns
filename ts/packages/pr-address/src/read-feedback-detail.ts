import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { z } from "zod";

import { isRecord } from "@asdl/core";
import { failure, ok, type ClinkrExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { loadJsonInput } from "./json-input.ts";
import {
	createNodePayloadStoreFactory,
	readJsonPayloadArtifact,
	resolveJsonPointer as resolvePayloadJsonPointer,
	type PayloadArtifactStore,
	type PayloadClock,
	type PayloadReference,
	type PayloadStoreFactory,
} from "./payload-store.ts";
import { resolveOperationInput, resolvePrFeedbackSourceFromSession, type PrFeedbackSourceResolution } from "./session-inputs.ts";

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

const readFeedbackDetailParseSchema = z.object({
	payload_path: z.string().optional(),
	pr_number: z.int().optional(),
	json_pointer: z.string().optional(),
	harness_session_id: z.string().optional(),
});

interface ReadFeedbackDetailResult {
	payload_path: string;
	json_pointer: string;
	detail_kind: DetailKind;
	value: unknown;
}

interface PayloadOperationError {
	errorType: string;
	message: string;
}

type FeedbackSourceChoice = { type: "payload_path"; payloadPath: string } | { type: "pr_number"; prNumber: number };

interface FeedbackDetailsReadableSource {
	payloadPath: string;
	store: PayloadArtifactStore;
	resolvedInput?: PayloadReference | undefined;
}

export const readFeedbackDetailOperation = defineExecOperation({
	spec: {
		name: "read-feedback-detail",
		description: "Read one selected PR feedback body or item from a raw payload artifact.",
		schema: readFeedbackDetailParseSchema,
		handler: runReadFeedbackDetailOperation,
	},
});

async function runReadFeedbackDetailOperation(ctx: PrAddressExecContext, request: z.output<typeof readFeedbackDetailParseSchema>): Promise<ClinkrExit<unknown>> {
	const jsonPointer = request.json_pointer;
	if (jsonPointer === undefined) return failure("invalid_request", "--json-pointer requires a value.");
	const source = await resolveFeedbackSource({
		commandName: "read-feedback-detail",
		payloadPath: request.payload_path,
		prNumber: request.pr_number,
		harnessSessionId: request.harness_session_id,
		ctx,
	});
	if (source.type === "error") return failure(source.errorType, source.message);
	const result = await readFeedbackDetail({
		payloadPath: source.value.payloadPath,
		jsonPointer,
		payloadStoreFactory: ctx.context.payloadStoreFactory,
		clock: ctx.context.payloadClock,
		store: source.value.kind === "session" ? source.value.store : undefined,
	});
	if (result.type === "error") return failure(result.errorType, result.message);
	if (source.value.kind === "raw_path") return ok(result.value);
	return ok({ ...result.value, resolved_inputs: { feedback: source.value.resolvedInput } });
}

export async function readFeedbackDetail(options: {
	payloadPath: string;
	jsonPointer: string;
	payloadStoreFactory?: PayloadStoreFactory | undefined;
	clock?: PayloadClock | undefined;
	store?: PayloadArtifactStore | undefined;
}): Promise<{ type: "ok"; value: ReadFeedbackDetailResult } | { type: "error"; errorType: string; message: string }> {
	const detailKind = detailKindForPointer(options.jsonPointer);
	if (detailKind === null) return { type: "error", errorType: "invalid_request", message: `JSON Pointer is not an allowed PR feedback detail locator: ${pythonRepr(options.jsonPointer)}` };
	if (!basename(options.payloadPath).endsWith(".raw.json")) {
		return { type: "error", errorType: "payload_lookup_failed", message: `Payload artifact is not an allowed raw payload: ${options.payloadPath}` };
	}
	const storeResult = options.store === undefined ? await openStoreForPayload(options.payloadStoreFactory, options.payloadPath, options.clock) : { type: "ok" as const, value: options.store };
	const envelopeResult = storeResult.type === "error" ? await readLooseJsonFile(options.payloadPath) : await readRawClinkrEnvelope(options.payloadPath, storeResult.value);
	if (envelopeResult.type === "error") return envelopeResult;
	const envelope = envelopeResult.value;
	if (!isRecord(envelope)) return { type: "error", errorType: "payload_lookup_failed", message: `Raw payload artifact must contain a Clinkr envelope object: ${options.payloadPath}` };
	if (envelope.exit_code !== 0) return { type: "error", errorType: "payload_lookup_failed", message: `Raw payload artifact must be a successful Clinkr envelope: ${options.payloadPath}` };
	if (!("data" in envelope)) return { type: "error", errorType: "payload_lookup_failed", message: `Raw payload artifact is missing Clinkr data: ${options.payloadPath}` };
	const valueResult = resolvePayloadJsonPointer(envelope, options.jsonPointer);
	if (valueResult.type === "error") return { type: "error", errorType: "payload_lookup_failed", message: valueResult.message };
	const value = valueResult.value;
	if (detailKind.endsWith("_body")) {
		if (typeof value !== "string") return { type: "error", errorType: "payload_lookup_failed", message: `Feedback body locator resolved to non-string value in ${options.payloadPath}: ${options.jsonPointer}` };
	} else if (!isRecord(value)) {
		return { type: "error", errorType: "payload_lookup_failed", message: `Feedback item locator resolved to non-object value in ${options.payloadPath}: ${options.jsonPointer}` };
	}
	return { type: "ok", value: { payload_path: options.payloadPath, json_pointer: options.jsonPointer, detail_kind: detailKind, value } };
}

async function resolveFeedbackSource(options: {
	commandName: "read-feedback-detail";
	payloadPath: string | undefined;
	prNumber: number | undefined;
	harnessSessionId: string | undefined;
	ctx: PrAddressExecContext;
}): Promise<{ type: "ok"; value: PrFeedbackSourceResolution } | ({ type: "error" } & PayloadOperationError)> {
	const choice = await resolveFeedbackSourceChoice({ commandName: options.commandName, payloadPath: options.payloadPath, prNumber: options.prNumber });
	if (choice.type === "error") return choice;
	if (choice.value.type === "payload_path") return { type: "ok", value: { kind: "raw_path", payloadPath: choice.value.payloadPath } };
	return await resolvePrFeedbackSourceFromSession({ ctx: options.ctx, prNumber: choice.value.prNumber, harnessSessionId: options.harnessSessionId });
}

const readFeedbackDetailsSelectionSchema = z.looseObject({
	payload_path: z.string().optional(),
	pr_number: z.int().optional(),
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
	resolved_inputs?: { feedback: PayloadReference } | undefined;
}

type ReadFeedbackDetailsOutcome = { type: "ok"; value: ReadFeedbackDetailsResult } | { type: "error"; errorType: string; message: string };

const readFeedbackDetailsParseSchema = z.object({
	selection_json: z.string().optional(),
	pr_number: z.int().optional(),
	harness_session_id: z.string().optional(),
});

export const readFeedbackDetailsOperation = defineExecOperation({
	spec: {
		name: "read-feedback-details",
		description: "Read selected PR feedback bodies or items into a summary payload artifact.",
		schema: readFeedbackDetailsParseSchema,
		handler: runReadFeedbackDetailsOperation,
	},
});

async function runReadFeedbackDetailsOperation(ctx: PrAddressExecContext, request: z.output<typeof readFeedbackDetailsParseSchema>): Promise<ClinkrExit<unknown>> {
	const selectionResult = await loadJsonInput({
		optionValue: request.selection_json,
		commandName: "read-feedback-details",
		inputDescription: "selection JSON",
		optionName: "--selection-json",
		schema: readFeedbackDetailsSelectionSchema,
		stdin: ctx.stdin,
	});
	if (selectionResult.type === "error") return failure(selectionResult.error.errorType, selectionResult.error.message);
	const result = await readFeedbackDetails({
		selection: selectionResult.value,
		cliPrNumber: request.pr_number,
		harnessSessionId: request.harness_session_id,
		ctx,
		payloadStoreFactory: ctx.context.payloadStoreFactory,
		clock: ctx.context.payloadClock,
	});
	if (result.type === "error") return failure(result.errorType, result.message);
	return ok(result.value);
}

export async function readFeedbackDetails(options: {
	selection: ReadFeedbackDetailsSelection;
	cliPrNumber?: number | undefined;
	harnessSessionId?: string | undefined;
	ctx?: PrAddressExecContext | undefined;
	payloadStoreFactory?: PayloadStoreFactory | undefined;
	clock?: PayloadClock | undefined;
}): Promise<ReadFeedbackDetailsOutcome> {
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

	const sourceResult = await resolveFeedbackDetailsSource(options);
	if (sourceResult.type === "error") return { type: "error", errorType: sourceResult.errorType, message: sourceResult.message };
	const source = sourceResult.value;
	const envelopeResult = await readRawClinkrEnvelope(source.payloadPath, source.store);
	if (envelopeResult.type === "error") return envelopeResult;
	const envelope = envelopeResult.value;

	const selected: SelectedFeedbackDetail[] = [];
	for (const { pointer, detailKind } of locators) {
		const valueResult = resolvePayloadJsonPointer(envelope, pointer);
		if (valueResult.type === "error") return { type: "error", errorType: valueResult.errorType, message: valueResult.message };
		const typeError = detailValueTypeError({ value: valueResult.value, detailKind, payloadPath: source.payloadPath, jsonPointer: pointer });
		if (typeError !== null) return typeError;
		selected.push({ json_pointer: pointer, detail_kind: detailKind, value: valueResult.value });
	}

	const referenceResult = await writeSelectedDetailsArtifact({ sourcePayloadPath: source.payloadPath, selected, store: source.store });
	if (referenceResult.type === "error") return { type: "error", errorType: referenceResult.errorType, message: referenceResult.message };

	const summaries = selected.map(detailSummary);
	const value: ReadFeedbackDetailsResult = {
		payload_path: source.payloadPath,
		selected_payload_reference: referenceResult.value,
		details: summaries,
		counts: {
			requested: selection.json_pointers.length,
			selected: summaries.length,
			body_values: summaries.filter((summary) => summary.value_kind === "string").length,
			item_values: summaries.filter((summary) => summary.value_kind === "object").length,
		},
	};
	if (source.resolvedInput !== undefined) value.resolved_inputs = { feedback: source.resolvedInput };
	return { type: "ok", value };
}

async function resolveFeedbackDetailsSource(options: {
	selection: ReadFeedbackDetailsSelection;
	cliPrNumber?: number | undefined;
	harnessSessionId?: string | undefined;
	ctx?: PrAddressExecContext | undefined;
	payloadStoreFactory?: PayloadStoreFactory | undefined;
	clock?: PayloadClock | undefined;
}): Promise<{ type: "ok"; value: FeedbackDetailsReadableSource } | ({ type: "error" } & PayloadOperationError)> {
	const choice = await resolveFeedbackSourceChoice({ commandName: "read-feedback-details", selection: options.selection, cliPrNumber: options.cliPrNumber });
	if (choice.type === "error") return choice;
	if (choice.value.type === "payload_path") {
		const storeResult = await openStoreForPayload(options.payloadStoreFactory, choice.value.payloadPath, options.clock);
		if (storeResult.type === "error") return { type: "error", errorType: storeResult.errorType, message: storeResult.message };
		return { type: "ok", value: { payloadPath: choice.value.payloadPath, store: storeResult.value } };
	}
	if (options.ctx === undefined) {
		return { type: "error", errorType: "invalid_request", message: "read-feedback-details --pr-number requires an execution context." };
	}
	const source = await resolvePrFeedbackSourceFromSession({ ctx: options.ctx, prNumber: choice.value.prNumber, harnessSessionId: options.harnessSessionId });
	if (source.type === "error") return source;
	return { type: "ok", value: { payloadPath: source.value.payloadPath, store: source.value.store, resolvedInput: source.value.resolvedInput } };
}

async function resolveFeedbackSourceChoice(
	options:
		| { commandName: "read-feedback-detail"; payloadPath: string | undefined; prNumber: number | undefined }
		| { commandName: "read-feedback-details"; selection: ReadFeedbackDetailsSelection; cliPrNumber: number | undefined },
): Promise<{ type: "ok"; value: FeedbackSourceChoice } | ({ type: "error" } & PayloadOperationError)> {
	if (options.commandName === "read-feedback-detail") {
		const resolved = await resolveOperationInput<FeedbackSourceChoice>({
			commandName: "read-feedback-detail",
			explicitSource: {
				present: options.payloadPath !== undefined,
				description: "--payload-path",
				resolve: async () => {
					if (options.payloadPath === undefined) throw new Error("read-feedback-detail payload-path source was selected without payload_path");
					return { type: "ok", value: { type: "payload_path", payloadPath: options.payloadPath } };
				},
			},
			sessionSource: {
				selected: options.prNumber !== undefined,
				description: "--pr-number",
				resolve: async () => {
					if (options.prNumber === undefined) throw new Error("read-feedback-detail PR-number source was selected without pr_number");
					return { type: "ok", value: { type: "pr_number", prNumber: options.prNumber } };
				},
			},
			defaultSource: "error",
			mixInputMessage: "read-feedback-detail cannot mix --payload-path with --pr-number; pass exactly one feedback source.",
			missingInputMessage: "read-feedback-detail requires a feedback source via --payload-path or --pr-number.",
		});
		if (resolved.type === "error") return resolved;
		return { type: "ok", value: resolved.value.value };
	}

	const selection = options.selection;
	if (options.cliPrNumber !== undefined && (selection.payload_path !== undefined || selection.pr_number !== undefined)) {
		return {
			type: "error",
			errorType: "invalid_request",
			message: "read-feedback-details cannot mix --pr-number with a selection feedback source; pass exactly one feedback source.",
		};
	}
	if (selection.payload_path !== undefined && selection.pr_number !== undefined) {
		return {
			type: "error",
			errorType: "invalid_request",
			message: "read-feedback-details selection cannot mix payload_path with pr_number; pass exactly one feedback source.",
		};
	}
	const prNumber = options.cliPrNumber ?? selection.pr_number;
	const resolved = await resolveOperationInput<FeedbackSourceChoice>({
		commandName: "read-feedback-details",
		explicitSource: {
			present: selection.payload_path !== undefined,
			description: "selection payload_path",
			resolve: async () => {
				if (selection.payload_path === undefined) throw new Error("read-feedback-details payload-path source was selected without payload_path");
				return { type: "ok", value: { type: "payload_path", payloadPath: selection.payload_path } };
			},
		},
		sessionSource: {
			selected: prNumber !== undefined,
			description: "selection pr_number or --pr-number",
			resolve: async () => {
				if (prNumber === undefined) throw new Error("read-feedback-details PR-number source resolution lost pr_number");
				return { type: "ok", value: { type: "pr_number", prNumber } };
			},
		},
		defaultSource: "error",
		missingInputMessage: "read-feedback-details requires a feedback source via selection payload_path, selection pr_number, or --pr-number.",
	});
	if (resolved.type === "error") return resolved;
	return { type: "ok", value: resolved.value.value };
}

async function openStoreForPayload(
	payloadStoreFactory: PayloadStoreFactory | undefined,
	payloadPath: string,
	clock: PayloadClock | undefined,
): Promise<{ type: "ok"; value: PayloadArtifactStore } | { type: "error"; errorType: string; message: string }> {
	const factory = payloadStoreFactory ?? createNodePayloadStoreFactory();
	const storeResult = await factory.openContainingArtifact(payloadPath, { clock });
	if (storeResult.type === "error") return { type: "error", errorType: storeResult.errorType, message: storeResult.message };
	return storeResult;
}

async function readRawClinkrEnvelope(payloadPath: string, store: PayloadArtifactStore | undefined): Promise<{ type: "ok"; value: Record<string, unknown> } | { type: "error"; errorType: string; message: string }> {
	const documentResult = store === undefined ? await readJsonPayloadArtifact(payloadPath, { allowedRoles: RAW_PAYLOAD_ROLES }) : await store.readJsonArtifact({ payloadPath, allowedRoles: RAW_PAYLOAD_ROLES });
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
	store: PayloadArtifactStore;
}): Promise<{ type: "ok"; value: PayloadReference } | { type: "error"; errorType: string; message: string }> {
	const reference = await options.store.writeJsonArtifact({
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

async function readLooseJsonFile(path: string): Promise<{ type: "ok"; value: unknown } | { type: "error"; errorType: string; message: string }> {
	try {
		return { type: "ok", value: JSON.parse(await readFile(path, "utf8")) as unknown };
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

function pythonRepr(value: string): string {
	return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}
