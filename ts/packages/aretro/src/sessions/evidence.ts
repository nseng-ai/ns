import { sha256HexPrefix } from "../sha256.ts";

import type { ParsedSession, SessionSourceRef, SessionUsage } from "./types.ts";

export type EvidenceMetadataValue = string | number | boolean | null;

export interface SessionEvidenceItem {
	kind: string;
	subject: string;
	summary: string;
	count: number | null;
	session_count: number | null;
	source_refs: readonly SessionSourceRef[];
	metadata: Readonly<Record<string, EvidenceMetadataValue>>;
}

const EVIDENCE_KIND_ORDER: readonly string[] = [
	"tool_usage_count",
	"failed_tool_result",
	"repeated_file_read",
	"repeated_shell_command",
	"token_usage_observed",
	"large_output_observed",
] as const;

const READ_TOOL_NAMES = new Set(["read"]);
const SHELL_TOOL_NAMES = new Set(["bash", "shell", "sh", "terminal", "run_command"]);
const UNKNOWN_TOOL = "unknown_tool";
const MAX_SUBJECT_LENGTH = 500;
const HASH_PREFIX_LENGTH = 16;

interface GroupAccumulator {
	count: number;
	sessionIndices: ReadonlySet<number>;
	sourceRefs: readonly SessionSourceRef[];
}

interface FailureAccumulator extends GroupAccumulator {
	errorMessageCount: number;
}

interface LargeOutputAccumulator extends GroupAccumulator {
	maxOutputLength: number | null;
	maxLineCount: number | null;
	truncatedCount: number;
	charThresholdHits: number;
	lineThresholdHits: number;
}

interface UsageAccumulator extends GroupAccumulator {
	inputTokens: number | null;
	outputTokens: number | null;
	cacheReadTokens: number | null;
	cacheWriteTokens: number | null;
	totalTokens: number | null;
}

interface LargeOutputItemsOptions {
	lineThreshold: number;
	charThreshold: number;
	maxSourceRefs: number;
}

interface RecordLargeOutputOptions {
	group: LargeOutputAccumulator;
	sessionIndex: number;
	ref: SessionSourceRef;
	maxSourceRefs: number;
	outputLength: number | null;
	lineCount: number | null;
	truncated: boolean | null;
	hasCharThresholdHit: boolean;
	hasLineThresholdHit: boolean;
}

export interface CollectEvidenceOptions {
	repeatedFileReadThreshold?: number;
	repeatedShellCommandThreshold?: number;
	largeOutputLineThreshold?: number;
	largeOutputCharThreshold?: number;
	maxSourceRefsPerItem?: number;
}

export function collectSessionEvidence(
	sessions: readonly ParsedSession[],
	options: CollectEvidenceOptions = {},
): readonly SessionEvidenceItem[] {
	if (sessions.length === 0) return [];

	const repeatedFileReadThreshold = Math.max(1, options.repeatedFileReadThreshold ?? 2);
	const repeatedShellCommandThreshold = Math.max(1, options.repeatedShellCommandThreshold ?? 2);
	const largeOutputLineThreshold = Math.max(0, options.largeOutputLineThreshold ?? 200);
	const largeOutputCharThreshold = Math.max(0, options.largeOutputCharThreshold ?? 20_000);
	const maxSourceRefs = Math.max(0, options.maxSourceRefsPerItem ?? 10);

	const items: SessionEvidenceItem[] = [];
	items.push(...toolUsageItems(sessions, maxSourceRefs));
	items.push(...failedToolItems(sessions, maxSourceRefs));
	items.push(...repeatedFileReadItems(sessions, repeatedFileReadThreshold, maxSourceRefs));
	items.push(...repeatedShellCommandItems(sessions, repeatedShellCommandThreshold, maxSourceRefs));
	const usageItem = tokenUsageItem(sessions, maxSourceRefs);
	if (usageItem !== null) items.push(usageItem);
	items.push(
		...largeOutputItems(sessions, {
			lineThreshold: largeOutputLineThreshold,
			charThreshold: largeOutputCharThreshold,
			maxSourceRefs,
		}),
	);

	return items.sort(
		(a, b) =>
			kindIndex(a.kind) - kindIndex(b.kind) ||
			(b.count ?? 0) - (a.count ?? 0) ||
			metadataInt(b.metadata, "max_output_length") - metadataInt(a.metadata, "max_output_length") ||
			a.subject.localeCompare(b.subject),
	);
}

function toolUsageItems(
	sessions: readonly ParsedSession[],
	maxSourceRefs: number,
): SessionEvidenceItem[] {
	const groups = new Map<string, GroupAccumulator>();
	for (const [sessionIndex, session] of sessions.entries()) {
		for (const toolCall of session.tool_calls) {
			const subject = toolCall.tool_name;
			const group = groups.get(subject) ?? emptyGroupAccumulator();
			groups.set(
				subject,
				recordGroup({
					group,
					sessionIndex,
					ref: sourceRef(toolCall.source_ref, session),
					maxSourceRefs,
				}),
			);
		}
	}

	const items: SessionEvidenceItem[] = [];
	for (const [subject, group] of groups) {
		items.push({
			kind: "tool_usage_count",
			subject,
			summary: `${subject} called ${group.count} ${plural("time", group.count)} across ${group.sessionIndices.size} ${plural("session", group.sessionIndices.size)}`,
			count: group.count,
			session_count: group.sessionIndices.size,
			source_refs: group.sourceRefs,
			metadata: {},
		});
	}
	return items;
}

function failedToolItems(
	sessions: readonly ParsedSession[],
	maxSourceRefs: number,
): SessionEvidenceItem[] {
	const groups = new Map<string, FailureAccumulator>();
	for (const [sessionIndex, session] of sessions.entries()) {
		for (const toolResult of session.tool_results) {
			if (!toolResult.is_error) continue;
			const subject = toolResult.tool_name ?? UNKNOWN_TOOL;
			const group = groups.get(subject) ?? emptyFailureAccumulator();
			const base = recordGroup({
				group,
				sessionIndex,
				ref: sourceRef(toolResult.source_ref, session),
				maxSourceRefs,
			});
			groups.set(subject, {
				...group,
				...base,
				errorMessageCount: group.errorMessageCount + (toolResult.error_message !== null ? 1 : 0),
			});
		}
	}

	const items: SessionEvidenceItem[] = [];
	for (const [subject, group] of groups) {
		const metadata: Record<string, EvidenceMetadataValue> =
			group.errorMessageCount > 0 ? { error_message_count: group.errorMessageCount } : {};
		items.push({
			kind: "failed_tool_result",
			subject,
			summary: `${group.count} failed ${plural("tool result", group.count)} for ${subject} across ${group.sessionIndices.size} ${plural("session", group.sessionIndices.size)}`,
			count: group.count,
			session_count: group.sessionIndices.size,
			source_refs: group.sourceRefs,
			metadata,
		});
	}
	return items;
}

function repeatedFileReadItems(
	sessions: readonly ParsedSession[],
	threshold: number,
	maxSourceRefs: number,
): SessionEvidenceItem[] {
	const groups = new Map<string, GroupAccumulator>();
	for (const [sessionIndex, session] of sessions.entries()) {
		for (const toolCall of session.tool_calls) {
			if (!isReadTool(toolCall.tool_name) || toolCall.path === undefined) continue;
			const subject = toolCall.path;
			const group = groups.get(subject) ?? emptyGroupAccumulator();
			groups.set(
				subject,
				recordGroup({
					group,
					sessionIndex,
					ref: sourceRef(toolCall.source_ref, session),
					maxSourceRefs,
				}),
			);
		}
	}

	const items: SessionEvidenceItem[] = [];
	for (const [subject, group] of groups) {
		if (group.count < threshold) continue;
		items.push({
			kind: "repeated_file_read",
			subject,
			summary: `${subject} read ${group.count} ${plural("time", group.count)} across ${group.sessionIndices.size} ${plural("session", group.sessionIndices.size)}`,
			count: group.count,
			session_count: group.sessionIndices.size,
			source_refs: group.sourceRefs,
			metadata: {},
		});
	}
	return items;
}

function repeatedShellCommandItems(
	sessions: readonly ParsedSession[],
	threshold: number,
	maxSourceRefs: number,
): SessionEvidenceItem[] {
	const groups = new Map<string, GroupAccumulator>();
	for (const [sessionIndex, session] of sessions.entries()) {
		for (const commandExecution of session.command_executions) {
			const command = commandExecution.command;
			const group = groups.get(command) ?? emptyGroupAccumulator();
			groups.set(
				command,
				recordGroup({
					group,
					sessionIndex,
					ref: sourceRef(commandExecution.source_ref, session),
					maxSourceRefs,
				}),
			);
		}
		for (const toolCall of session.tool_calls) {
			if (!isShellTool(toolCall.tool_name) || toolCall.command === undefined) continue;
			const command = toolCall.command;
			const group = groups.get(command) ?? emptyGroupAccumulator();
			groups.set(
				command,
				recordGroup({
					group,
					sessionIndex,
					ref: sourceRef(toolCall.source_ref, session),
					maxSourceRefs,
				}),
			);
		}
	}

	const items: SessionEvidenceItem[] = [];
	for (const [command, group] of groups) {
		if (group.count < threshold) continue;
		const { subject, metadata } = boundedCommandSubject(command);
		items.push({
			kind: "repeated_shell_command",
			subject,
			summary: `shell command occurred ${group.count} ${plural("time", group.count)} across ${group.sessionIndices.size} ${plural("session", group.sessionIndices.size)}`,
			count: group.count,
			session_count: group.sessionIndices.size,
			source_refs: group.sourceRefs,
			metadata,
		});
	}
	return items;
}

function tokenUsageItem(
	sessions: readonly ParsedSession[],
	maxSourceRefs: number,
): SessionEvidenceItem | null {
	let usage: UsageAccumulator = emptyUsageAccumulator();

	for (const [sessionIndex, session] of sessions.entries()) {
		for (const usageEvent of session.usage_events) {
			usage = recordUsage({
				usage,
				sessionIndex,
				ref: sourceRef(usageEvent.source_ref, session),
				maxSourceRefs,
				event: usageEvent,
			});
		}
	}

	if (usage.count === 0) return null;

	const metadata: Record<string, EvidenceMetadataValue> = {
		usage_event_count: usage.count,
		...(usage.inputTokens === null ? {} : { input_tokens: usage.inputTokens }),
		...(usage.outputTokens === null ? {} : { output_tokens: usage.outputTokens }),
		...(usage.cacheReadTokens === null ? {} : { cache_read_tokens: usage.cacheReadTokens }),
		...(usage.cacheWriteTokens === null ? {} : { cache_write_tokens: usage.cacheWriteTokens }),
		...(usage.totalTokens === null ? {} : { total_tokens: usage.totalTokens }),
	};

	return {
		kind: "token_usage_observed",
		subject: "token_usage",
		summary: `token usage observed in ${usage.count} ${plural("event", usage.count)} across ${usage.sessionIndices.size} ${plural("session", usage.sessionIndices.size)}`,
		count: usage.count,
		session_count: usage.sessionIndices.size,
		source_refs: usage.sourceRefs,
		metadata,
	};
}

function largeOutputItems(
	sessions: readonly ParsedSession[],
	options: LargeOutputItemsOptions,
): SessionEvidenceItem[] {
	const groups = new Map<string, LargeOutputAccumulator>();

	for (const [sessionIndex, session] of sessions.entries()) {
		for (const toolResult of session.tool_results) {
			const charHit = hitsThreshold(toolResult.text_length, options.charThreshold);
			const lineHit = hitsThreshold(toolResult.line_count, options.lineThreshold);
			if (toolResult.truncated !== true && !charHit && !lineHit) continue;

			const subject = `tool_result:${toolResult.tool_name ?? UNKNOWN_TOOL}`;
			const group = groups.get(subject) ?? emptyLargeOutputAccumulator();
			groups.set(
				subject,
				recordLargeOutput({
					group,
					sessionIndex,
					ref: sourceRef(toolResult.source_ref, session),
					maxSourceRefs: options.maxSourceRefs,
					outputLength: toolResult.text_length,
					lineCount: toolResult.line_count,
					truncated: toolResult.truncated,
					hasCharThresholdHit: charHit,
					hasLineThresholdHit: lineHit,
				}),
			);
		}

		for (const commandExecution of session.command_executions) {
			const charHit = hitsThreshold(commandExecution.output_length, options.charThreshold);
			const lineHit = hitsThreshold(commandExecution.line_count, options.lineThreshold);
			if (commandExecution.truncated !== true && !charHit && !lineHit) continue;

			const subject = "command_execution";
			const group = groups.get(subject) ?? emptyLargeOutputAccumulator();
			groups.set(
				subject,
				recordLargeOutput({
					group,
					sessionIndex,
					ref: sourceRef(commandExecution.source_ref, session),
					maxSourceRefs: options.maxSourceRefs,
					outputLength: commandExecution.output_length,
					lineCount: commandExecution.line_count,
					truncated: commandExecution.truncated,
					hasCharThresholdHit: charHit,
					hasLineThresholdHit: lineHit,
				}),
			);
		}
	}

	const items: SessionEvidenceItem[] = [];
	for (const [subject, group] of groups) {
		const metadata: Record<string, EvidenceMetadataValue> = {
			truncated_count: group.truncatedCount,
			char_threshold_hits: group.charThresholdHits,
			line_threshold_hits: group.lineThresholdHits,
			...(group.maxOutputLength === null ? {} : { max_output_length: group.maxOutputLength }),
			...(group.maxLineCount === null ? {} : { max_line_count: group.maxLineCount }),
		};

		items.push({
			kind: "large_output_observed",
			subject,
			summary: `${group.count} large or truncated ${plural("output", group.count)} observed for ${subject} across ${group.sessionIndices.size} ${plural("session", group.sessionIndices.size)}`,
			count: group.count,
			session_count: group.sessionIndices.size,
			source_refs: group.sourceRefs,
			metadata,
		});
	}
	return items;
}

function emptyGroupAccumulator(): GroupAccumulator {
	return { count: 0, sessionIndices: new Set(), sourceRefs: [] };
}

function emptyFailureAccumulator(): FailureAccumulator {
	return {
		...emptyGroupAccumulator(),
		errorMessageCount: 0,
	};
}

function emptyLargeOutputAccumulator(): LargeOutputAccumulator {
	return {
		...emptyGroupAccumulator(),
		maxOutputLength: null,
		maxLineCount: null,
		truncatedCount: 0,
		charThresholdHits: 0,
		lineThresholdHits: 0,
	};
}

function emptyUsageAccumulator(): UsageAccumulator {
	return {
		...emptyGroupAccumulator(),
		inputTokens: null,
		outputTokens: null,
		cacheReadTokens: null,
		cacheWriteTokens: null,
		totalTokens: null,
	};
}

function recordGroup(options: {
	group: GroupAccumulator;
	sessionIndex: number;
	ref: SessionSourceRef;
	maxSourceRefs: number;
}): GroupAccumulator {
	const sessionIndices = new Set(options.group.sessionIndices);
	sessionIndices.add(options.sessionIndex);
	return {
		count: options.group.count + 1,
		sessionIndices,
		sourceRefs: appendUniqueSourceRef({
			sourceRefs: options.group.sourceRefs,
			ref: options.ref,
			maxSourceRefs: options.maxSourceRefs,
		}),
	};
}

function recordUsage(options: {
	usage: UsageAccumulator;
	sessionIndex: number;
	ref: SessionSourceRef;
	maxSourceRefs: number;
	event: SessionUsage;
}): UsageAccumulator {
	const base = recordGroup({
		group: options.usage,
		sessionIndex: options.sessionIndex,
		ref: options.ref,
		maxSourceRefs: options.maxSourceRefs,
	});
	return {
		...options.usage,
		...base,
		inputTokens: addOptionalTotal(options.usage.inputTokens, options.event.input_tokens),
		outputTokens: addOptionalTotal(options.usage.outputTokens, options.event.output_tokens),
		cacheReadTokens: addOptionalTotal(
			options.usage.cacheReadTokens,
			options.event.cache_read_tokens,
		),
		cacheWriteTokens: addOptionalTotal(
			options.usage.cacheWriteTokens,
			options.event.cache_write_tokens,
		),
		totalTokens: addOptionalTotal(options.usage.totalTokens, options.event.total_tokens),
	};
}

function recordLargeOutput(options: RecordLargeOutputOptions): LargeOutputAccumulator {
	const base = recordGroup({
		group: options.group,
		sessionIndex: options.sessionIndex,
		ref: options.ref,
		maxSourceRefs: options.maxSourceRefs,
	});
	return {
		...options.group,
		...base,
		maxOutputLength: maxNullable(options.group.maxOutputLength, options.outputLength),
		maxLineCount: maxNullable(options.group.maxLineCount, options.lineCount),
		truncatedCount: options.group.truncatedCount + (options.truncated === true ? 1 : 0),
		charThresholdHits: options.group.charThresholdHits + (options.hasCharThresholdHit ? 1 : 0),
		lineThresholdHits: options.group.lineThresholdHits + (options.hasLineThresholdHit ? 1 : 0),
	};
}

function sourceRef(ref: SessionSourceRef | null, session: ParsedSession): SessionSourceRef {
	return ref ?? session.source_ref;
}

function appendUniqueSourceRef(options: {
	sourceRefs: readonly SessionSourceRef[];
	ref: SessionSourceRef;
	maxSourceRefs: number;
}): readonly SessionSourceRef[] {
	if (options.sourceRefs.length >= options.maxSourceRefs) return options.sourceRefs;
	const key = sourceRefKey(options.ref);
	for (const existing of options.sourceRefs) {
		if (sourceRefKey(existing) === key) return options.sourceRefs;
	}
	return [...options.sourceRefs, options.ref];
}

function sourceRefKey(ref: SessionSourceRef): string {
	return `${ref.path ?? ""}|${ref.uri ?? ""}|${ref.line_number ?? ""}`;
}

function isReadTool(toolName: string): boolean {
	return READ_TOOL_NAMES.has(toolName.toLowerCase());
}

function isShellTool(toolName: string): boolean {
	return SHELL_TOOL_NAMES.has(toolName.toLowerCase());
}

function boundedCommandSubject(command: string): {
	subject: string;
	metadata: Record<string, EvidenceMetadataValue>;
} {
	if (command.length <= MAX_SUBJECT_LENGTH) {
		return { subject: command, metadata: {} };
	}
	const digest = sha256HexPrefix(command, HASH_PREFIX_LENGTH);
	const subject = `${command.slice(0, MAX_SUBJECT_LENGTH)}…`;
	return {
		subject,
		metadata: {
			subject_truncated: true,
			command_sha256_prefix: digest,
		},
	};
}

function addOptionalTotal(current: number | null, value: number | null): number | null {
	if (value === null) return current;
	if (current === null) return value;
	return current + value;
}

function maxNullable(current: number | null, value: number | null): number | null {
	if (value === null) return current;
	if (current === null) return value;
	return Math.max(current, value);
}

function hitsThreshold(value: number | null, threshold: number): boolean {
	if (value === null) return false;
	return value >= threshold;
}

function plural(noun: string, count: number): string {
	return count === 1 ? noun : `${noun}s`;
}

function kindIndex(kind: string): number {
	const index = EVIDENCE_KIND_ORDER.indexOf(kind);
	return index === -1 ? EVIDENCE_KIND_ORDER.length : index;
}

function metadataInt(
	metadata: Readonly<Record<string, EvidenceMetadataValue>>,
	key: string,
): number {
	const value = metadata[key];
	if (typeof value === "number") return value;
	return 0;
}
