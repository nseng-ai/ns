/**
 * Sanitized payload detail document construction for retros evidence.
 */

import { z } from "zod";

import { boundedCommandSubject } from "../command-subject.ts";

import {
	optionalSessionSourceRefToDto,
	sessionSourceRefDtoSchema,
	type SessionSourceRefDto,
} from "../contracts.ts";
import type {
	AggregateMetricsDto,
	EvidenceItemDto,
	RepoContextDto,
	SessionQueryDto,
	SessionSourceInfoDto,
	SessionSummaryDto,
	SessionWarningDto,
} from "../contracts.ts";
import {
	sessionCommandExecutionOutput,
	sessionToolResultOutput,
	type ParsedSession,
	type SessionCommandExecution,
	type SessionModelEvent,
	type SessionSourceRef,
	type SessionToolCall,
	type SessionToolResult,
	type SessionUsage,
	type SessionWarning,
} from "../sessions/types.ts";

const MAX_COMMAND_SUBJECT_LENGTH = 500;
const COMMAND_SUBJECT_PREFIX_LENGTH = 120;
const COMMAND_HASH_PREFIX_LENGTH = 16;

type CommandMetadata = Record<string, string | number | boolean | null>;

export const payloadSourceRefDtoSchema = sessionSourceRefDtoSchema;
export type PayloadSourceRefDto = SessionSourceRefDto;

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

export const retrosEvidencePayloadDataSchema = z.object({
	schemaVersion: z.literal(1),
	repo: z.record(z.string(), z.unknown()),
	query: z.record(z.string(), z.unknown()),
	source: z.record(z.string(), z.unknown()),
	aggregateMetrics: z.record(z.string(), z.unknown()),
	sessions: z.array(sessionDetailDtoSchema),
	warnings: z.array(payloadWarningDtoSchema),
	evidenceItems: z.array(evidenceDetailItemDtoSchema),
});

export type RetrosEvidencePayloadData = z.infer<typeof retrosEvidencePayloadDataSchema>;

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
}): RetrosEvidencePayloadData {
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
	const bounded = boundedCommandSubject(command, {
		maxLength: MAX_COMMAND_SUBJECT_LENGTH,
		prefixLength: COMMAND_SUBJECT_PREFIX_LENGTH,
		hashPrefixLength: COMMAND_HASH_PREFIX_LENGTH,
		formatTruncatedSubject: (prefix, sha256Prefix) => `${prefix}…[sha256:${sha256Prefix}]`,
	});
	if (!bounded.truncated) return { subject: bounded.subject, metadata: {} };
	return {
		subject: bounded.subject,
		metadata: {
			truncated: true,
			originalLength: bounded.originalLength,
			sha256Prefix: bounded.sha256Prefix,
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
		sourceRef: optionalSessionSourceRefToDto(options.event.source_ref ?? null),
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
		sourceRef: optionalSessionSourceRefToDto(options.call.source_ref),
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
	const output = sessionToolResultOutput(options.result);
	indexSourceRef(output.source_ref, {
		pointer: options.pointer,
		pointerIndex: options.pointerIndex,
	});
	return {
		toolCallId: options.result.tool_call_id,
		toolName: options.result.tool_name,
		isError: options.result.is_error,
		hasErrorMessage: options.result.error_message !== null,
		textLength: output.length,
		lineCount: output.line_count,
		isTruncated: output.truncated,
		sourceRef: optionalSessionSourceRefToDto(output.source_ref),
	};
}

function commandExecutionDetail(options: {
	execution: SessionCommandExecution;
	pointer: string;
	pointerIndex: Map<string, string[]>;
}): CommandExecutionDetailDto {
	const output = sessionCommandExecutionOutput(options.execution);
	indexSourceRef(output.source_ref, {
		pointer: options.pointer,
		pointerIndex: options.pointerIndex,
	});
	const bounded = commandSubjectForPayload(options.execution.command);
	return {
		commandSubject: bounded.subject,
		commandMetadata: bounded.metadata,
		exitCode: options.execution.exit_code,
		isCancelled: options.execution.cancelled,
		isTruncated: output.truncated,
		outputLength: output.length,
		lineCount: output.line_count,
		sourceRef: optionalSessionSourceRefToDto(output.source_ref),
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
		sourceRef: optionalSessionSourceRefToDto(options.usage.source_ref),
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
		sourceRef: optionalSessionSourceRefToDto(warning.source_ref),
		harness: warning.harness,
		adapterName: warning.adapter_name,
	};
}

function payloadWarningFromDto(warning: SessionWarningDto): PayloadWarningDto {
	return {
		code: warning.code,
		message: warning.message,
		sourceRef: warning.sourceRef,
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
		sourceRefs: [...item.sourceRefs],
		metadata: { ...item.metadata },
	};
}
