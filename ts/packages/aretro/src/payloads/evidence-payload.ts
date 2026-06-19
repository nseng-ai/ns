/**
 * Sanitized payload detail document construction for aretro evidence.
 */

import { createHash } from "node:crypto";

import { z } from "zod";

import type {
	AggregateMetricsDto,
	EvidenceItemDto,
	RepoContextDto,
	SessionQueryDto,
	SessionSourceInfoDto,
	SessionSummaryDto,
	SessionWarningDto,
} from "../contracts.ts";
import type {
	ParsedSession,
	SessionCommandExecution,
	SessionModelEvent,
	SessionSourceRef,
	SessionToolCall,
	SessionToolResult,
	SessionUsage,
	SessionWarning,
} from "../sessions/types.ts";

const MAX_COMMAND_SUBJECT_LENGTH = 500;
const COMMAND_SUBJECT_PREFIX_LENGTH = 120;
const COMMAND_HASH_PREFIX_LENGTH = 16;

type JsonObject = Record<string, unknown>;
type CommandMetadata = Record<string, string | number | boolean | null>;
type SourceRefKey = readonly [string | null, string | null, number | null];

export const payloadSourceRefDtoSchema = z.object({
	path: z.string().nullable(),
	uri: z.string().nullable(),
	line_number: z.number().nullable(),
});

export type PayloadSourceRefDto = z.infer<typeof payloadSourceRefDtoSchema>;

export const payloadWarningDtoSchema = z.object({
	code: z.string(),
	message: z.string(),
	source_ref: payloadSourceRefDtoSchema.nullable(),
	harness: z.string().nullable(),
	adapter_name: z.string().nullable(),
});

export type PayloadWarningDto = z.infer<typeof payloadWarningDtoSchema>;

export const modelEventDetailDtoSchema = z.object({
	provider: z.string().nullable(),
	model: z.string().nullable(),
	source_ref: payloadSourceRefDtoSchema.nullable(),
});

export type ModelEventDetailDto = z.infer<typeof modelEventDetailDtoSchema>;

export const toolCallDetailDtoSchema = z.object({
	call_id: z.string().nullable(),
	tool_name: z.string(),
	argument_keys: z.array(z.string()),
	source_ref: payloadSourceRefDtoSchema.nullable(),
	path: z.string().nullable(),
	command_subject: z.string().nullable(),
	command_metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export type ToolCallDetailDto = z.infer<typeof toolCallDetailDtoSchema>;

export const toolResultDetailDtoSchema = z.object({
	tool_call_id: z.string().nullable(),
	tool_name: z.string().nullable(),
	is_error: z.boolean(),
	has_error_message: z.boolean(),
	text_length: z.number().nullable(),
	line_count: z.number().nullable(),
	truncated: z.boolean().nullable(),
	source_ref: payloadSourceRefDtoSchema.nullable(),
});

export type ToolResultDetailDto = z.infer<typeof toolResultDetailDtoSchema>;

export const commandExecutionDetailDtoSchema = z.object({
	command_subject: z.string(),
	command_metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
	exit_code: z.number().nullable(),
	cancelled: z.boolean().nullable(),
	truncated: z.boolean().nullable(),
	output_length: z.number().nullable(),
	line_count: z.number().nullable(),
	source_ref: payloadSourceRefDtoSchema.nullable(),
});

export type CommandExecutionDetailDto = z.infer<typeof commandExecutionDetailDtoSchema>;

export const usageDetailDtoSchema = z.object({
	input_tokens: z.number().nullable(),
	output_tokens: z.number().nullable(),
	cache_read_tokens: z.number().nullable(),
	cache_write_tokens: z.number().nullable(),
	total_tokens: z.number().nullable(),
	source_ref: payloadSourceRefDtoSchema.nullable(),
});

export type UsageDetailDto = z.infer<typeof usageDetailDtoSchema>;

export const sessionDetailDtoSchema = z.object({
	session_index: z.number(),
	session_id: z.string().nullable(),
	summary: z.record(z.string(), z.unknown()),
	model_events: z.array(modelEventDetailDtoSchema),
	tool_calls: z.array(toolCallDetailDtoSchema),
	tool_results: z.array(toolResultDetailDtoSchema),
	command_executions: z.array(commandExecutionDetailDtoSchema),
	usage_events: z.array(usageDetailDtoSchema),
	warnings: z.array(payloadWarningDtoSchema),
});

export type SessionDetailDto = z.infer<typeof sessionDetailDtoSchema>;

export const evidenceDetailItemDtoSchema = z.object({
	evidence_index: z.number(),
	item: z.record(z.string(), z.unknown()),
	supporting_event_pointers: z.array(z.string()),
});

export type EvidenceDetailItemDto = z.infer<typeof evidenceDetailItemDtoSchema>;

export const aretroEvidencePayloadDataSchema = z.object({
	schema_version: z.literal(1),
	repo: z.record(z.string(), z.unknown()),
	query: z.record(z.string(), z.unknown()),
	source: z.record(z.string(), z.unknown()),
	aggregate_metrics: z.record(z.string(), z.unknown()),
	sessions: z.array(sessionDetailDtoSchema),
	warnings: z.array(payloadWarningDtoSchema),
	evidence_items: z.array(evidenceDetailItemDtoSchema),
});

export type AretroEvidencePayloadData = z.infer<typeof aretroEvidencePayloadDataSchema>;

export interface CompactResult {
	repo: RepoContextDto;
	query: SessionQueryDto;
	source: SessionSourceInfoDto;
	aggregate_metrics: AggregateMetricsDto;
	sessions: readonly SessionSummaryDto[];
	warnings: readonly SessionWarningDto[];
	evidence_items: readonly EvidenceItemDto[];
}

export function buildEvidencePayloadData(options: {
	compactResult: CompactResult;
	sessions: readonly ParsedSession[];
}): AretroEvidencePayloadData {
	const compactData: JsonObject = {
		repo: options.compactResult.repo,
		query: options.compactResult.query,
		source: options.compactResult.source,
		aggregate_metrics: options.compactResult.aggregate_metrics,
		sessions: options.compactResult.sessions,
		warnings: options.compactResult.warnings,
		evidence_items: options.compactResult.evidence_items,
	};
	const pointerIndex = new Map<string, string[]>();
	const detailSessions = options.sessions.map((session, sessionIndex) =>
		sessionDetail({
			session,
			sessionIndex,
			compactSession: jsonObjectAt(compactData, "sessions", sessionIndex),
			pointerIndex,
		}),
	);
	const evidenceItems = jsonObjects(compactData, "evidence_items").map(
		(compactItem, evidenceIndex) =>
			evidenceDetailItem({
				evidenceIndex,
				compactItem,
				pointerIndex,
			}),
	);

	return {
		schema_version: 1,
		repo: jsonObject(compactData, "repo"),
		query: jsonObject(compactData, "query"),
		source: jsonObject(compactData, "source"),
		aggregate_metrics: jsonObject(compactData, "aggregate_metrics"),
		sessions: detailSessions,
		warnings: [...warningsFromJson(compactData)],
		evidence_items: evidenceItems,
	};
}

export function commandSubjectForPayload(command: string): {
	subject: string;
	metadata: CommandMetadata;
} {
	if (command.length <= MAX_COMMAND_SUBJECT_LENGTH) {
		return { subject: command, metadata: {} };
	}

	const sha256Prefix = createHash("sha256")
		.update(command, "utf-8")
		.digest("hex")
		.slice(0, COMMAND_HASH_PREFIX_LENGTH);
	const subject = `${command.slice(0, COMMAND_SUBJECT_PREFIX_LENGTH)}…[sha256:${sha256Prefix}]`;
	return {
		subject,
		metadata: {
			truncated: true,
			original_length: command.length,
			sha256_prefix: sha256Prefix,
		},
	};
}

function sessionDetail(options: {
	session: ParsedSession;
	sessionIndex: number;
	compactSession: JsonObject;
	pointerIndex: Map<string, string[]>;
}): SessionDetailDto {
	const { session, sessionIndex, compactSession, pointerIndex } = options;
	const modelEvents = session.model_events.map((event, eventIndex) =>
		modelEventDetail({
			event,
			pointer: `/data/sessions/${sessionIndex}/model_events/${eventIndex}`,
			pointerIndex,
		}),
	);
	const toolCalls = session.tool_calls.map((call, callIndex) =>
		toolCallDetail({
			call,
			pointer: `/data/sessions/${sessionIndex}/tool_calls/${callIndex}`,
			pointerIndex,
		}),
	);
	const toolResults = session.tool_results.map((result, resultIndex) =>
		toolResultDetail({
			result,
			pointer: `/data/sessions/${sessionIndex}/tool_results/${resultIndex}`,
			pointerIndex,
		}),
	);
	const commandExecutions = session.command_executions.map((execution, executionIndex) =>
		commandExecutionDetail({
			execution,
			pointer: `/data/sessions/${sessionIndex}/command_executions/${executionIndex}`,
			pointerIndex,
		}),
	);
	const usageEvents = session.usage_events.map((usage, usageIndex) =>
		usageDetail({
			usage,
			pointer: `/data/sessions/${sessionIndex}/usage_events/${usageIndex}`,
			pointerIndex,
		}),
	);
	const warnings = session.warnings.map((warning, warningIndex) =>
		sessionWarningDetail({
			warning,
			pointer: `/data/sessions/${sessionIndex}/warnings/${warningIndex}`,
			pointerIndex,
		}),
	);
	return {
		session_index: sessionIndex,
		session_id: session.session_id,
		summary: compactSession,
		model_events: modelEvents,
		tool_calls: toolCalls,
		tool_results: toolResults,
		command_executions: commandExecutions,
		usage_events: usageEvents,
		warnings,
	};
}

function modelEventDetail(options: {
	event: SessionModelEvent;
	pointer: string;
	pointerIndex: Map<string, string[]>;
}): ModelEventDetailDto {
	indexSourceRef(options.event.source_ref ?? null, {
		pointer: options.pointer,
		pointerIndex: options.pointerIndex,
	});
	return {
		provider: options.event.provider ?? null,
		model: options.event.model ?? null,
		source_ref: optionalSourceRefToDto(options.event.source_ref ?? null),
	};
}

function toolCallDetail(options: {
	call: SessionToolCall;
	pointer: string;
	pointerIndex: Map<string, string[]>;
}): ToolCallDetailDto {
	indexSourceRef(options.call.source_ref, {
		pointer: options.pointer,
		pointerIndex: options.pointerIndex,
	});
	let commandSubject: string | null = null;
	let commandMetadata: CommandMetadata = {};
	if (options.call.command !== undefined) {
		const bounded = commandSubjectForPayload(options.call.command);
		commandSubject = bounded.subject;
		commandMetadata = bounded.metadata;
	}
	return {
		call_id: options.call.call_id,
		tool_name: options.call.tool_name,
		argument_keys: [...options.call.argument_keys],
		source_ref: optionalSourceRefToDto(options.call.source_ref),
		path: options.call.path ?? null,
		command_subject: commandSubject,
		command_metadata: commandMetadata,
	};
}

function toolResultDetail(options: {
	result: SessionToolResult;
	pointer: string;
	pointerIndex: Map<string, string[]>;
}): ToolResultDetailDto {
	indexSourceRef(options.result.source_ref, {
		pointer: options.pointer,
		pointerIndex: options.pointerIndex,
	});
	return {
		tool_call_id: options.result.tool_call_id,
		tool_name: options.result.tool_name,
		is_error: options.result.is_error,
		has_error_message: options.result.error_message !== null,
		text_length: options.result.text_length,
		line_count: options.result.line_count,
		truncated: options.result.truncated,
		source_ref: optionalSourceRefToDto(options.result.source_ref),
	};
}

function commandExecutionDetail(options: {
	execution: SessionCommandExecution;
	pointer: string;
	pointerIndex: Map<string, string[]>;
}): CommandExecutionDetailDto {
	indexSourceRef(options.execution.source_ref, {
		pointer: options.pointer,
		pointerIndex: options.pointerIndex,
	});
	const bounded = commandSubjectForPayload(options.execution.command);
	return {
		command_subject: bounded.subject,
		command_metadata: bounded.metadata,
		exit_code: options.execution.exit_code,
		cancelled: options.execution.cancelled,
		truncated: options.execution.truncated,
		output_length: options.execution.output_length,
		line_count: options.execution.line_count,
		source_ref: optionalSourceRefToDto(options.execution.source_ref),
	};
}

function usageDetail(options: {
	usage: SessionUsage;
	pointer: string;
	pointerIndex: Map<string, string[]>;
}): UsageDetailDto {
	indexSourceRef(options.usage.source_ref, {
		pointer: options.pointer,
		pointerIndex: options.pointerIndex,
	});
	return {
		input_tokens: options.usage.input_tokens,
		output_tokens: options.usage.output_tokens,
		cache_read_tokens: options.usage.cache_read_tokens,
		cache_write_tokens: options.usage.cache_write_tokens,
		total_tokens: options.usage.total_tokens,
		source_ref: optionalSourceRefToDto(options.usage.source_ref),
	};
}

function sessionWarningDetail(options: {
	warning: SessionWarning;
	pointer: string;
	pointerIndex: Map<string, string[]>;
}): PayloadWarningDto {
	indexSourceRef(options.warning.source_ref, {
		pointer: options.pointer,
		pointerIndex: options.pointerIndex,
	});
	return warningToDto(options.warning);
}

function evidenceDetailItem(options: {
	evidenceIndex: number;
	compactItem: JsonObject;
	pointerIndex: Map<string, string[]>;
}): EvidenceDetailItemDto {
	const supportingEventPointers: string[] = [];
	const seenPointers = new Set<string>();
	for (const sourceRef of sourceRefsFromItem(options.compactItem)) {
		const key = sourceRefKeyToString(sourceRef);
		const pointers = options.pointerIndex.get(key) ?? [];
		for (const pointer of pointers) {
			if (!seenPointers.has(pointer)) {
				supportingEventPointers.push(pointer);
				seenPointers.add(pointer);
			}
		}
	}
	return {
		evidence_index: options.evidenceIndex,
		item: options.compactItem,
		supporting_event_pointers: supportingEventPointers,
	};
}

function indexSourceRef(
	sourceRef: SessionSourceRef | null,
	options: { pointer: string; pointerIndex: Map<string, string[]> },
): void {
	if (sourceRef === null) {
		return;
	}
	const key = sourceRefKeyToString(sourceRefKey(sourceRef));
	const pointers = options.pointerIndex.get(key);
	if (pointers === undefined) {
		options.pointerIndex.set(key, [options.pointer]);
	} else {
		pointers.push(options.pointer);
	}
}

function sourceRefKey(sourceRef: SessionSourceRef): SourceRefKey {
	return [sourceRef.path, sourceRef.uri, sourceRef.line_number];
}

function sourceRefKeyToString(key: SourceRefKey): string {
	return JSON.stringify(key);
}

function sourceRefJsonKey(sourceRef: JsonObject): SourceRefKey {
	const path = sourceRef.path;
	const uri = sourceRef.uri;
	const lineNumber = sourceRef.line_number;
	return [
		typeof path === "string" ? path : null,
		typeof uri === "string" ? uri : null,
		typeof lineNumber === "number" ? lineNumber : null,
	];
}

function sourceRefsFromItem(item: JsonObject): readonly SourceRefKey[] {
	const sourceRefs = item.source_refs;
	if (!Array.isArray(sourceRefs)) {
		return [];
	}
	return sourceRefs
		.filter(
			(sourceRef): sourceRef is JsonObject => typeof sourceRef === "object" && sourceRef !== null,
		)
		.map((sourceRef) => sourceRefJsonKey(sourceRef));
}

function warningToDto(warning: SessionWarning): PayloadWarningDto {
	return {
		code: warning.code,
		message: warning.message,
		source_ref: optionalSourceRefToDto(warning.source_ref),
		harness: warning.harness,
		adapter_name: warning.adapter_name,
	};
}

function warningFromJson(warning: JsonObject): PayloadWarningDto {
	const sourceRef = warning.source_ref;
	return {
		code: String(warning.code ?? ""),
		message: String(warning.message ?? ""),
		source_ref:
			typeof sourceRef === "object" && sourceRef !== null
				? sourceRefFromJson(sourceRef as JsonObject)
				: null,
		harness: optionalString(warning.harness),
		adapter_name: optionalString(warning.adapter_name),
	};
}

function sourceRefToDto(sourceRef: SessionSourceRef): PayloadSourceRefDto {
	return {
		path: sourceRef.path,
		uri: sourceRef.uri,
		line_number: sourceRef.line_number,
	};
}

function optionalSourceRefToDto(sourceRef: SessionSourceRef | null): PayloadSourceRefDto | null {
	if (sourceRef === null) {
		return null;
	}
	return sourceRefToDto(sourceRef);
}

function sourceRefFromJson(sourceRef: JsonObject): PayloadSourceRefDto {
	const path = sourceRef.path;
	const uri = sourceRef.uri;
	const lineNumber = sourceRef.line_number;
	return {
		path: typeof path === "string" ? path : null,
		uri: typeof uri === "string" ? uri : null,
		line_number: typeof lineNumber === "number" ? lineNumber : null,
	};
}

function warningsFromJson(data: JsonObject): readonly PayloadWarningDto[] {
	const warnings = data.warnings;
	if (!Array.isArray(warnings)) {
		return [];
	}
	return warnings
		.filter((warning): warning is JsonObject => typeof warning === "object" && warning !== null)
		.map((warning) => warningFromJson(warning));
}

function jsonObject(data: JsonObject, key: string): JsonObject {
	const value = data[key];
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as JsonObject;
	}
	return {};
}

function jsonObjects(data: JsonObject, key: string): readonly JsonObject[] {
	const value = data[key];
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter(
		(item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item),
	);
}

function jsonObjectAt(data: JsonObject, key: string, index: number): JsonObject {
	const value = data[key];
	if (!Array.isArray(value) || index >= value.length) {
		return {};
	}
	const item = value[index];
	if (typeof item === "object" && item !== null && !Array.isArray(item)) {
		return item as JsonObject;
	}
	return {};
}

function optionalString(value: unknown): string | null {
	if (typeof value === "string") {
		return value;
	}
	return null;
}
