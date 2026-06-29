/**
 * Sanitized payload detail document construction for aretro evidence.
 */

import { z } from "zod";

import { sha256HexPrefix } from "../sha256.ts";

import type {
	AggregateMetricsDto,
	EvidenceItemDto,
	RepoContextDto,
	SessionQueryDto,
	SessionSourceInfoDto,
	SessionSourceRefDto,
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

type CommandMetadata = Record<string, string | number | boolean | null>;

export const payloadSourceRefDtoSchema = z.object({
	path: z.string().nullable(),
	uri: z.string().nullable(),
	lineNumber: z.number().nullable(),
});

export type PayloadSourceRefDto = z.infer<typeof payloadSourceRefDtoSchema>;

export const payloadWarningDtoSchema = z.object({
	code: z.string(),
	message: z.string(),
	sourceRef: payloadSourceRefDtoSchema.nullable(),
	harness: z.string().nullable(),
	adapterName: z.string().nullable(),
});

export type PayloadWarningDto = z.infer<typeof payloadWarningDtoSchema>;

export const modelEventDetailDtoSchema = z.object({
	provider: z.string().nullable(),
	model: z.string().nullable(),
	sourceRef: payloadSourceRefDtoSchema.nullable(),
});

export type ModelEventDetailDto = z.infer<typeof modelEventDetailDtoSchema>;

export const toolCallDetailDtoSchema = z.object({
	callId: z.string().nullable(),
	toolName: z.string(),
	argumentKeys: z.array(z.string()),
	sourceRef: payloadSourceRefDtoSchema.nullable(),
	path: z.string().nullable(),
	commandSubject: z.string().nullable(),
	commandMetadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export type ToolCallDetailDto = z.infer<typeof toolCallDetailDtoSchema>;

export const toolResultDetailDtoSchema = z.object({
	toolCallId: z.string().nullable(),
	toolName: z.string().nullable(),
	isError: z.boolean(),
	hasErrorMessage: z.boolean(),
	textLength: z.number().nullable(),
	lineCount: z.number().nullable(),
	isTruncated: z.boolean().nullable(),
	sourceRef: payloadSourceRefDtoSchema.nullable(),
});

export type ToolResultDetailDto = z.infer<typeof toolResultDetailDtoSchema>;

export const commandExecutionDetailDtoSchema = z.object({
	commandSubject: z.string(),
	commandMetadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
	exitCode: z.number().nullable(),
	isCancelled: z.boolean().nullable(),
	isTruncated: z.boolean().nullable(),
	outputLength: z.number().nullable(),
	lineCount: z.number().nullable(),
	sourceRef: payloadSourceRefDtoSchema.nullable(),
});

export type CommandExecutionDetailDto = z.infer<typeof commandExecutionDetailDtoSchema>;

export const usageDetailDtoSchema = z.object({
	input_tokens: z.number().nullable(),
	output_tokens: z.number().nullable(),
	cache_read_tokens: z.number().nullable(),
	cache_write_tokens: z.number().nullable(),
	total_tokens: z.number().nullable(),
	sourceRef: payloadSourceRefDtoSchema.nullable(),
});

export type UsageDetailDto = z.infer<typeof usageDetailDtoSchema>;

export const sessionDetailDtoSchema = z.object({
	sessionIndex: z.number(),
	sessionId: z.string().nullable(),
	summary: z.record(z.string(), z.unknown()),
	modelEvents: z.array(modelEventDetailDtoSchema),
	toolCalls: z.array(toolCallDetailDtoSchema),
	toolResults: z.array(toolResultDetailDtoSchema),
	commandExecutions: z.array(commandExecutionDetailDtoSchema),
	usageEvents: z.array(usageDetailDtoSchema),
	warnings: z.array(payloadWarningDtoSchema),
});

export type SessionDetailDto = z.infer<typeof sessionDetailDtoSchema>;

export const evidenceDetailItemDtoSchema = z.object({
	evidenceIndex: z.number(),
	item: z.record(z.string(), z.unknown()),
	supportingEventPointers: z.array(z.string()),
});

export type EvidenceDetailItemDto = z.infer<typeof evidenceDetailItemDtoSchema>;

export const aretroEvidencePayloadDataSchema = z.object({
	schemaVersion: z.literal(1),
	repo: z.record(z.string(), z.unknown()),
	query: z.record(z.string(), z.unknown()),
	source: z.record(z.string(), z.unknown()),
	aggregateMetrics: z.record(z.string(), z.unknown()),
	sessions: z.array(sessionDetailDtoSchema),
	warnings: z.array(payloadWarningDtoSchema),
	evidenceItems: z.array(evidenceDetailItemDtoSchema),
});

export type AretroEvidencePayloadData = z.infer<typeof aretroEvidencePayloadDataSchema>;

export interface CompactResult {
	repo: RepoContextDto;
	query: SessionQueryDto;
	source: SessionSourceInfoDto;
	aggregateMetrics: AggregateMetricsDto;
	sessions: readonly SessionSummaryDto[];
	warnings: readonly SessionWarningDto[];
	evidenceItems: readonly EvidenceItemDto[];
}

export function buildEvidencePayloadData(options: {
	compactResult: CompactResult;
	sessions: readonly ParsedSession[];
}): AretroEvidencePayloadData {
	const pointerIndex = new Map<string, string[]>();
	const detailSessions = options.sessions.map((session, sessionIndex) =>
		sessionDetail({
			session,
			sessionIndex,
			compactSession: { ...(options.compactResult.sessions[sessionIndex] ?? {}) },
			pointerIndex,
		}),
	);
	const evidenceItems = options.compactResult.evidenceItems.map((compactItem, evidenceIndex) =>
		evidenceDetailItem({
			evidenceIndex,
			compactItem,
			pointerIndex,
		}),
	);

	return {
		schemaVersion: 1,
		repo: { ...options.compactResult.repo },
		query: { ...options.compactResult.query },
		source: { ...options.compactResult.source },
		aggregateMetrics: { ...options.compactResult.aggregateMetrics },
		sessions: detailSessions,
		warnings: options.compactResult.warnings.map((warning) => payloadWarningFromDto(warning)),
		evidenceItems: evidenceItems,
	};
}

export function commandSubjectForPayload(command: string): {
	subject: string;
	metadata: CommandMetadata;
} {
	if (command.length <= MAX_COMMAND_SUBJECT_LENGTH) {
		return { subject: command, metadata: {} };
	}

	const sha256Prefix = sha256HexPrefix(command, COMMAND_HASH_PREFIX_LENGTH);
	const subject = `${command.slice(0, COMMAND_SUBJECT_PREFIX_LENGTH)}…[sha256:${sha256Prefix}]`;
	return {
		subject,
		metadata: {
			truncated: true,
			originalLength: command.length,
			sha256Prefix: sha256Prefix,
		},
	};
}

function sessionDetail(options: {
	session: ParsedSession;
	sessionIndex: number;
	compactSession: Record<string, unknown>;
	pointerIndex: Map<string, string[]>;
}): SessionDetailDto {
	const { session, sessionIndex, compactSession, pointerIndex } = options;
	const modelEvents = session.model_events.map((event, eventIndex) =>
		modelEventDetail({
			event,
			pointer: `/data/sessions/${sessionIndex}/modelEvents/${eventIndex}`,
			pointerIndex,
		}),
	);
	const toolCalls = session.tool_calls.map((call, callIndex) =>
		toolCallDetail({
			call,
			pointer: `/data/sessions/${sessionIndex}/toolCalls/${callIndex}`,
			pointerIndex,
		}),
	);
	const toolResults = session.tool_results.map((result, resultIndex) =>
		toolResultDetail({
			result,
			pointer: `/data/sessions/${sessionIndex}/toolResults/${resultIndex}`,
			pointerIndex,
		}),
	);
	const commandExecutions = session.command_executions.map((execution, executionIndex) =>
		commandExecutionDetail({
			execution,
			pointer: `/data/sessions/${sessionIndex}/commandExecutions/${executionIndex}`,
			pointerIndex,
		}),
	);
	const usageEvents = session.usage_events.map((usage, usageIndex) =>
		usageDetail({
			usage,
			pointer: `/data/sessions/${sessionIndex}/usageEvents/${usageIndex}`,
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
		sessionIndex: sessionIndex,
		sessionId: session.session_id,
		summary: compactSession,
		modelEvents: modelEvents,
		toolCalls: toolCalls,
		toolResults: toolResults,
		commandExecutions: commandExecutions,
		usageEvents: usageEvents,
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
		sourceRef: optionalSourceRefToDto(options.event.source_ref ?? null),
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
		callId: options.call.call_id,
		toolName: options.call.tool_name,
		argumentKeys: [...options.call.argument_keys],
		sourceRef: optionalSourceRefToDto(options.call.source_ref),
		path: options.call.path ?? null,
		commandSubject: commandSubject,
		commandMetadata: commandMetadata,
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
		toolCallId: options.result.tool_call_id,
		toolName: options.result.tool_name,
		isError: options.result.is_error,
		hasErrorMessage: options.result.error_message !== null,
		textLength: options.result.text_length,
		lineCount: options.result.line_count,
		isTruncated: options.result.truncated,
		sourceRef: optionalSourceRefToDto(options.result.source_ref),
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
		commandSubject: bounded.subject,
		commandMetadata: bounded.metadata,
		exitCode: options.execution.exit_code,
		isCancelled: options.execution.cancelled,
		isTruncated: options.execution.truncated,
		outputLength: options.execution.output_length,
		lineCount: options.execution.line_count,
		sourceRef: optionalSourceRefToDto(options.execution.source_ref),
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
		sourceRef: optionalSourceRefToDto(options.usage.source_ref),
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
	compactItem: EvidenceItemDto;
	pointerIndex: Map<string, string[]>;
}): EvidenceDetailItemDto {
	const supportingEventPointers: string[] = [];
	const seenPointers = new Set<string>();
	for (const sourceRef of options.compactItem.sourceRefs) {
		const key = refKey(sourceRef.path, sourceRef.uri, sourceRef.lineNumber);
		const pointers = options.pointerIndex.get(key) ?? [];
		for (const pointer of pointers) {
			if (!seenPointers.has(pointer)) {
				supportingEventPointers.push(pointer);
				seenPointers.add(pointer);
			}
		}
	}
	return {
		evidenceIndex: options.evidenceIndex,
		item: evidenceItemToPayloadObject(options.compactItem),
		supportingEventPointers: supportingEventPointers,
	};
}

function indexSourceRef(
	sourceRef: SessionSourceRef | null,
	options: { pointer: string; pointerIndex: Map<string, string[]> },
): void {
	if (sourceRef === null) {
		return;
	}
	const key = refKey(sourceRef.path, sourceRef.uri, sourceRef.line_number);
	const pointers = options.pointerIndex.get(key);
	if (pointers === undefined) {
		options.pointerIndex.set(key, [options.pointer]);
	} else {
		pointers.push(options.pointer);
	}
}

function refKey(path: string | null, uri: string | null, lineNumber: number | null): string {
	return JSON.stringify([path, uri, lineNumber]);
}

function warningToDto(warning: SessionWarning): PayloadWarningDto {
	return {
		code: warning.code,
		message: warning.message,
		sourceRef: optionalSourceRefToDto(warning.source_ref),
		harness: warning.harness,
		adapterName: warning.adapter_name,
	};
}

function payloadWarningFromDto(warning: SessionWarningDto): PayloadWarningDto {
	return {
		code: warning.code,
		message: warning.message,
		sourceRef: warning.sourceRef === null ? null : dtoSourceRefToPayload(warning.sourceRef),
		harness: warning.harness,
		adapterName: warning.adapterName,
	};
}

function evidenceItemToPayloadObject(item: EvidenceItemDto): Record<string, unknown> {
	return {
		kind: item.kind,
		subject: item.subject,
		summary: item.summary,
		count: item.count,
		sessionCount: item.sessionCount,
		sourceRefs: item.sourceRefs.map((sourceRef) => dtoSourceRefToPayload(sourceRef)),
		metadata: { ...item.metadata },
	};
}

function optionalSourceRefToDto(sourceRef: SessionSourceRef | null): PayloadSourceRefDto | null {
	if (sourceRef === null) {
		return null;
	}
	return {
		path: sourceRef.path,
		uri: sourceRef.uri,
		lineNumber: sourceRef.line_number,
	};
}

function dtoSourceRefToPayload(sourceRef: SessionSourceRefDto): PayloadSourceRefDto {
	return {
		path: sourceRef.path,
		uri: sourceRef.uri,
		lineNumber: sourceRef.lineNumber,
	};
}
