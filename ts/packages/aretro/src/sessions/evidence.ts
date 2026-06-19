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
	sessionIndices: Set<number>;
	sourceRefs: SessionSourceRef[];
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

interface UsageAccumulator {
	count: number;
	sessionIndices: Set<number>;
	sourceRefs: SessionSourceRef[];
	inputTokens: number | null;
	outputTokens: number | null;
	cacheReadTokens: number | null;
	cacheWriteTokens: number | null;
	totalTokens: number | null;
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
		...largeOutputItems(
			sessions,
			largeOutputLineThreshold,
			largeOutputCharThreshold,
			maxSourceRefs,
		),
	);

	return items.sort(
		(a, b) => evidenceSortKey(a) - evidenceSortKey(b) || a.subject.localeCompare(b.subject),
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
			if (!groups.has(subject)) {
				groups.set(subject, { count: 0, sessionIndices: new Set(), sourceRefs: [] });
			}
			const group = groups.get(subject)!;
			recordGroup(group, sessionIndex, sourceRef(toolCall.source_ref, session), maxSourceRefs);
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
			if (!groups.has(subject)) {
				groups.set(subject, {
					count: 0,
					sessionIndices: new Set(),
					sourceRefs: [],
					errorMessageCount: 0,
				});
			}
			const group = groups.get(subject)!;
			recordGroup(group, sessionIndex, sourceRef(toolResult.source_ref, session), maxSourceRefs);
			if (toolResult.error_message !== null) {
				group.errorMessageCount += 1;
			}
		}
	}

	const items: SessionEvidenceItem[] = [];
	for (const [subject, group] of groups) {
		const metadata: Record<string, EvidenceMetadataValue> = {};
		if (group.errorMessageCount > 0) {
			metadata.error_message_count = group.errorMessageCount;
		}
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
			if (!groups.has(subject)) {
				groups.set(subject, { count: 0, sessionIndices: new Set(), sourceRefs: [] });
			}
			const group = groups.get(subject)!;
			recordGroup(group, sessionIndex, sourceRef(toolCall.source_ref, session), maxSourceRefs);
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
			if (!groups.has(command)) {
				groups.set(command, { count: 0, sessionIndices: new Set(), sourceRefs: [] });
			}
			const group = groups.get(command)!;
			recordGroup(
				group,
				sessionIndex,
				sourceRef(commandExecution.source_ref, session),
				maxSourceRefs,
			);
		}
		for (const toolCall of session.tool_calls) {
			if (!isShellTool(toolCall.tool_name) || toolCall.command === undefined) continue;
			const command = toolCall.command;
			if (!groups.has(command)) {
				groups.set(command, { count: 0, sessionIndices: new Set(), sourceRefs: [] });
			}
			const group = groups.get(command)!;
			recordGroup(group, sessionIndex, sourceRef(toolCall.source_ref, session), maxSourceRefs);
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
	const usage: UsageAccumulator = {
		count: 0,
		sessionIndices: new Set(),
		sourceRefs: [],
		inputTokens: null,
		outputTokens: null,
		cacheReadTokens: null,
		cacheWriteTokens: null,
		totalTokens: null,
	};

	for (const [sessionIndex, session] of sessions.entries()) {
		for (const usageEvent of session.usage_events) {
			recordUsage(
				usage,
				sessionIndex,
				sourceRef(usageEvent.source_ref, session),
				maxSourceRefs,
				usageEvent,
			);
		}
	}

	if (usage.count === 0) return null;

	const metadata: Record<string, EvidenceMetadataValue> = {
		usage_event_count: usage.count,
	};
	setIfNotNull(metadata, "input_tokens", usage.inputTokens);
	setIfNotNull(metadata, "output_tokens", usage.outputTokens);
	setIfNotNull(metadata, "cache_read_tokens", usage.cacheReadTokens);
	setIfNotNull(metadata, "cache_write_tokens", usage.cacheWriteTokens);
	setIfNotNull(metadata, "total_tokens", usage.totalTokens);

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
	lineThreshold: number,
	charThreshold: number,
	maxSourceRefs: number,
): SessionEvidenceItem[] {
	const groups = new Map<string, LargeOutputAccumulator>();

	for (const [sessionIndex, session] of sessions.entries()) {
		for (const toolResult of session.tool_results) {
			const charHit = hitsThreshold(toolResult.text_length, charThreshold);
			const lineHit = hitsThreshold(toolResult.line_count, lineThreshold);
			if (toolResult.truncated !== true && !charHit && !lineHit) continue;

			const subject = `tool_result:${toolResult.tool_name ?? UNKNOWN_TOOL}`;
			if (!groups.has(subject)) {
				groups.set(subject, {
					count: 0,
					sessionIndices: new Set(),
					sourceRefs: [],
					maxOutputLength: null,
					maxLineCount: null,
					truncatedCount: 0,
					charThresholdHits: 0,
					lineThresholdHits: 0,
				});
			}
			const group = groups.get(subject)!;
			recordLargeOutput(
				group,
				sessionIndex,
				sourceRef(toolResult.source_ref, session),
				maxSourceRefs,
				toolResult.text_length,
				toolResult.line_count,
				toolResult.truncated,
				charHit,
				lineHit,
			);
		}

		for (const commandExecution of session.command_executions) {
			const charHit = hitsThreshold(commandExecution.output_length, charThreshold);
			const lineHit = hitsThreshold(commandExecution.line_count, lineThreshold);
			if (commandExecution.truncated !== true && !charHit && !lineHit) continue;

			const subject = "command_execution";
			if (!groups.has(subject)) {
				groups.set(subject, {
					count: 0,
					sessionIndices: new Set(),
					sourceRefs: [],
					maxOutputLength: null,
					maxLineCount: null,
					truncatedCount: 0,
					charThresholdHits: 0,
					lineThresholdHits: 0,
				});
			}
			const group = groups.get(subject)!;
			recordLargeOutput(
				group,
				sessionIndex,
				sourceRef(commandExecution.source_ref, session),
				maxSourceRefs,
				commandExecution.output_length,
				commandExecution.line_count,
				commandExecution.truncated,
				charHit,
				lineHit,
			);
		}
	}

	const items: SessionEvidenceItem[] = [];
	for (const [subject, group] of groups) {
		const metadata: Record<string, EvidenceMetadataValue> = {
			truncated_count: group.truncatedCount,
			char_threshold_hits: group.charThresholdHits,
			line_threshold_hits: group.lineThresholdHits,
		};
		setIfNotNull(metadata, "max_output_length", group.maxOutputLength);
		setIfNotNull(metadata, "max_line_count", group.maxLineCount);

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

function recordGroup(
	group: GroupAccumulator,
	sessionIndex: number,
	ref: SessionSourceRef,
	maxSourceRefs: number,
): void {
	group.count += 1;
	group.sessionIndices.add(sessionIndex);
	appendUniqueSourceRef(group.sourceRefs, ref, maxSourceRefs);
}

function recordUsage(
	usage: UsageAccumulator,
	sessionIndex: number,
	ref: SessionSourceRef,
	maxSourceRefs: number,
	event: SessionUsage,
): void {
	usage.count += 1;
	usage.sessionIndices.add(sessionIndex);
	appendUniqueSourceRef(usage.sourceRefs, ref, maxSourceRefs);
	usage.inputTokens = addOptionalTotal(usage.inputTokens, event.input_tokens);
	usage.outputTokens = addOptionalTotal(usage.outputTokens, event.output_tokens);
	usage.cacheReadTokens = addOptionalTotal(usage.cacheReadTokens, event.cache_read_tokens);
	usage.cacheWriteTokens = addOptionalTotal(usage.cacheWriteTokens, event.cache_write_tokens);
	usage.totalTokens = addOptionalTotal(usage.totalTokens, event.total_tokens);
}

function recordLargeOutput(
	group: LargeOutputAccumulator,
	sessionIndex: number,
	ref: SessionSourceRef,
	maxSourceRefs: number,
	outputLength: number | null,
	lineCount: number | null,
	truncated: boolean | null,
	charThresholdHit: boolean,
	lineThresholdHit: boolean,
): void {
	recordGroup(group, sessionIndex, ref, maxSourceRefs);
	if (outputLength !== null) {
		if (group.maxOutputLength === null || outputLength > group.maxOutputLength) {
			group.maxOutputLength = outputLength;
		}
	}
	if (lineCount !== null) {
		if (group.maxLineCount === null || lineCount > group.maxLineCount) {
			group.maxLineCount = lineCount;
		}
	}
	if (truncated === true) {
		group.truncatedCount += 1;
	}
	if (charThresholdHit) {
		group.charThresholdHits += 1;
	}
	if (lineThresholdHit) {
		group.lineThresholdHits += 1;
	}
}

function sourceRef(ref: SessionSourceRef | null, session: ParsedSession): SessionSourceRef {
	return ref ?? session.source_ref;
}

function appendUniqueSourceRef(
	sourceRefs: SessionSourceRef[],
	ref: SessionSourceRef,
	maxSourceRefs: number,
): void {
	if (sourceRefs.length >= maxSourceRefs) return;
	const key = sourceRefKey(ref);
	for (const existing of sourceRefs) {
		if (sourceRefKey(existing) === key) return;
	}
	sourceRefs.push(ref);
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
	// Simple hash using string content for deterministic prefix
	let hash = 0;
	for (let i = 0; i < command.length; i++) {
		hash = (hash << 5) - hash + command.charCodeAt(i);
		hash = hash & hash; // Convert to 32bit integer
	}
	const digest = Math.abs(hash)
		.toString(16)
		.padStart(HASH_PREFIX_LENGTH, "0")
		.slice(0, HASH_PREFIX_LENGTH);
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

function setIfNotNull(
	metadata: Record<string, EvidenceMetadataValue>,
	key: string,
	value: number | null,
): void {
	if (value !== null) {
		metadata[key] = value;
	}
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

function evidenceSortKey(item: SessionEvidenceItem): number {
	const count = item.count ?? 0;
	const size = metadataInt(item.metadata, "max_output_length");
	// Sort by kind index, then by count descending, then by size descending
	return kindIndex(item.kind) * 1_000_000 - count * 1_000 - size;
}

function metadataInt(
	metadata: Readonly<Record<string, EvidenceMetadataValue>>,
	key: string,
): number {
	const value = metadata[key];
	if (typeof value === "number") return value;
	return 0;
}
