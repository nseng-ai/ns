import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

import type {
	ParsedSession,
	SessionAssociation,
	SessionCommandExecution,
	SessionMessageCounts,
	SessionModelEvent,
	SessionQuery,
	SessionQueryResult,
	SessionSourceInfo,
	SessionSourceRef,
	SessionToolCall,
	SessionToolResult,
	SessionUsage,
	SessionWarning,
} from "./types.ts";
import type { SessionSource } from "./source.ts";

const PI_SOURCE_INFO: SessionSourceInfo = {
	harness: "pi",
	adapter_name: "pi_jsonl",
	record_format: "jsonl",
};

const KNOWN_IGNORED_RECORD_TYPES = new Set(["thinking_level_change", "custom_message"]);
const TOOL_CALL_TYPES = new Set(["toolCall", "tool_call", "tool_use"]);

interface JsonObject {
	[key: string]: unknown;
}

interface MutableMessageCounts {
	user: number;
	assistant: number;
	tool_result: number;
	command_execution: number;
	system: number;
	other: number;
}

interface JsonObjectDecodeResult {
	value: JsonObject | null;
	warnings: readonly SessionWarning[];
}

interface ParsedPiMessageContribution {
	messageCounts: SessionMessageCounts;
	toolCalls: readonly SessionToolCall[];
	toolResults: readonly SessionToolResult[];
	commandExecutions: readonly SessionCommandExecution[];
	usageEvents: readonly SessionUsage[];
	warnings: readonly SessionWarning[];
}

interface ParsedToolCallsContribution {
	toolCalls: readonly SessionToolCall[];
	warnings: readonly SessionWarning[];
}

interface ParsedCommandExecutionContribution {
	commandExecution: SessionCommandExecution | null;
	warnings: readonly SessionWarning[];
}

export function defaultPiSessionRoot(): string {
	return join(homedir(), ".pi", "agent", "sessions");
}

export function encodePiSessionDirName(repoRoot: string): string {
	const absolutePath = resolve(repoRoot);
	const normalized = absolutePath.replace(/^\/+|\/+$/g, "");
	return `--${normalized.replace(/\//g, "-")}--`;
}

function parsePiJsonlSession(path: string, repoRoot: string | null): ParsedSession {
	const warnings: SessionWarning[] = [];
	const modelEvents: SessionModelEvent[] = [];
	const toolCalls: SessionToolCall[] = [];
	const toolResults: SessionToolResult[] = [];
	const commandExecutions: SessionCommandExecution[] = [];
	const usageEvents: SessionUsage[] = [];
	let counts = emptyMessageCounts();

	let sessionId: string | null = null;
	let cwd: string | null = null;
	let startedAtIso: string | null = null;
	let latestTimestamp: string | null = null;
	let hasSessionHeader = false;

	const content = readFileSync(path, "utf-8");
	const lines = content.split("\n");

	for (let lineNumber = 1; lineNumber <= lines.length; lineNumber++) {
		const rawLine = lines[lineNumber - 1];
		if (!rawLine) continue;

		const sourceRef: SessionSourceRef = { path, uri: null, line_number: lineNumber };
		const decoded = decodeJsonObject(rawLine, sourceRef);
		warnings.push(...decoded.warnings);
		if (decoded.value === null) {
			continue;
		}
		const record = decoded.value;

		const timestamp = stringValue(record, "timestamp");
		latestTimestamp = maxIsoString(latestTimestamp, timestamp);
		const recordType = stringValue(record, "type");

		if (recordType === "session") {
			hasSessionHeader = true;
			sessionId = stringValue(record, "id");
			startedAtIso = timestamp;
			cwd = stringValue(record, "cwd");
		} else if (recordType === "model_change") {
			modelEvents.push(parsePiModelEvent(record));
		} else if (recordType === "message") {
			const contribution = parsePiMessage({ record, sourceRef });
			counts = addMessageCounts(counts, contribution.messageCounts);
			toolCalls.push(...contribution.toolCalls);
			toolResults.push(...contribution.toolResults);
			commandExecutions.push(...contribution.commandExecutions);
			usageEvents.push(...contribution.usageEvents);
			warnings.push(...contribution.warnings);
		} else if (recordType === "bashExecution") {
			counts = addMessageCounts(counts, {
				...emptyMessageCounts(),
				command_execution: 1,
			});
			const contribution = parsePiCommandExecution({ message: record, sourceRef });
			if (contribution.commandExecution !== null) {
				commandExecutions.push(contribution.commandExecution);
			}
			warnings.push(...contribution.warnings);
		} else if (recordType && KNOWN_IGNORED_RECORD_TYPES.has(recordType)) {
			continue;
		} else if (recordType === null) {
			warnings.push(
				adapterWarning({
					code: "unknown_record_shape",
					message: "Pi JSONL record is missing a string type field.",
					sourceRef,
				}),
			);
		} else {
			warnings.push(
				adapterWarning({
					code: "unknown_record_type",
					message: `Ignoring unsupported Pi JSONL record type: ${recordType}.`,
					sourceRef,
				}),
			);
		}
	}

	if (!hasSessionHeader) {
		warnings.push(
			adapterWarning({
				code: "missing_session_header",
				message: "Pi JSONL file did not contain a session header record.",
				sourceRef: { path, uri: null, line_number: null },
			}),
		);
	}

	return {
		source_info: PI_SOURCE_INFO,
		source_ref: { path, uri: null, line_number: null },
		session_id: sessionId,
		started_at_iso: startedAtIso,
		ended_at_iso: latestTimestamp,
		association: buildAssociation({ repoRoot, cwd }),
		message_counts: freezeMessageCounts(counts),
		model_events: modelEvents,
		tool_calls: toolCalls,
		tool_results: toolResults,
		command_executions: commandExecutions,
		usage_events: usageEvents,
		warnings: warnings,
	};
}

export class PiJsonlSessionSource implements SessionSource {
	readonly sourceInfo = PI_SOURCE_INFO;

	async query(query: SessionQuery): Promise<SessionQueryResult> {
		const sessionRoot = query.session_root ?? defaultPiSessionRoot();

		try {
			const stat = statSync(sessionRoot);
			if (!stat.isDirectory()) {
				return warningResult({
					code: "session_root_not_directory",
					message: `Pi session root is not a directory: ${sessionRoot}`,
					path: sessionRoot,
				});
			}
		} catch {
			return warningResult({
				code: "session_root_missing",
				message: `Pi session root does not exist: ${sessionRoot}`,
				path: sessionRoot,
			});
		}

		const repoSessionDir = join(sessionRoot, encodePiSessionDirName(query.repo_root));

		try {
			const stat = statSync(repoSessionDir);
			if (!stat.isDirectory()) {
				return warningResult({
					code: "repo_session_dir_not_directory",
					message: `Pi session path is not a directory: ${repoSessionDir}`,
					path: repoSessionDir,
				});
			}
		} catch {
			return warningResult({
				code: "repo_session_dir_missing",
				message: `Pi session directory does not exist for repo: ${query.repo_root}`,
				path: repoSessionDir,
			});
		}

		const files = readdirSync(repoSessionDir)
			.filter((name) => name.endsWith(".jsonl"))
			.map((name) => join(repoSessionDir, name))
			.sort()
			.reverse();

		const parsedSessions: ParsedSession[] = [];
		for (const filePath of files) {
			const session = parsePiJsonlSession(filePath, query.repo_root);
			parsedSessions.push(session);
		}

		const limited = limitSessions(parsedSessions, query.max_sessions);
		const allWarnings = limited.flatMap((session) => session.warnings);

		return {
			source_info: PI_SOURCE_INFO,
			sessions: limited,
			warnings: allWarnings,
		};
	}
}

function limitSessions(sessions: ParsedSession[], maxSessions: number): ParsedSession[] {
	if (maxSessions <= 0) {
		return [];
	}
	return sessions.slice(0, maxSessions);
}

function warningResult(opts: { code: string; message: string; path: string }): SessionQueryResult {
	const warning = adapterWarning({
		code: opts.code,
		message: opts.message,
		sourceRef: { path: opts.path, uri: null, line_number: null },
	});
	return {
		source_info: PI_SOURCE_INFO,
		sessions: [],
		warnings: [warning],
	};
}

function decodeJsonObject(rawLine: string, sourceRef: SessionSourceRef): JsonObjectDecodeResult {
	const trimmed = rawLine.trim();
	if (trimmed === "") {
		return { value: null, warnings: [] };
	}

	try {
		return coerceJsonObject(JSON.parse(rawLine), sourceRef);
	} catch (error) {
		const msg = error instanceof Error ? error.message : "Unknown JSON error";
		return {
			value: null,
			warnings: [
				adapterWarning({
					code: "malformed_json",
					message: `Could not decode Pi JSONL line: ${msg}.`,
					sourceRef,
				}),
			],
		};
	}
}

function coerceJsonObject(value: unknown, sourceRef: SessionSourceRef): JsonObjectDecodeResult {
	const result = objectFromValue(value);
	if (result !== null) return { value: result, warnings: [] };
	return {
		value: null,
		warnings: [
			adapterWarning({
				code: "unknown_record_shape",
				message: "Pi JSONL line decoded to a non-object value.",
				sourceRef,
			}),
		],
	};
}

function parsePiModelEvent(record: JsonObject): SessionModelEvent {
	const modelObject = objectValue(record, "model");
	let provider = stringValue(record, "provider");
	let model = stringValue(record, "model");

	if (modelObject !== null) {
		provider = provider ?? stringValue(modelObject, "provider");
		model =
			stringValue(modelObject, "id") ??
			stringValue(modelObject, "name") ??
			stringValue(modelObject, "model") ??
			model;
	}

	return {
		provider: provider ?? "",
		model: model ?? "",
	};
}

function parsePiMessage(options: {
	record: JsonObject;
	sourceRef: SessionSourceRef;
}): ParsedPiMessageContribution {
	const message = objectValue(options.record, "message");
	if (message === null) {
		return {
			messageCounts: { ...emptyMessageCounts(), other: 1 },
			toolCalls: [],
			toolResults: [],
			commandExecutions: [],
			usageEvents: [],
			warnings: [
				adapterWarning({
					code: "partial_record",
					message: "Pi message record is missing an object message field.",
					sourceRef: options.sourceRef,
				}),
			],
		};
	}

	const role = stringValue(message, "role");
	const roleResult = countMessageRole({ role, sourceRef: options.sourceRef });
	const usage = parseUsage(message, options.sourceRef);
	const usageEvents = usage === null ? [] : [usage];

	if (role === "assistant") {
		const toolCallResult = parseToolCalls({ message, sourceRef: options.sourceRef });
		return {
			messageCounts: roleResult.messageCounts,
			toolCalls: toolCallResult.toolCalls,
			toolResults: [],
			commandExecutions: [],
			usageEvents,
			warnings: [...roleResult.warnings, ...toolCallResult.warnings],
		};
	}
	if (role === "toolResult") {
		return {
			messageCounts: roleResult.messageCounts,
			toolCalls: [],
			toolResults: [parseToolResult(message, options.sourceRef)],
			commandExecutions: [],
			usageEvents,
			warnings: roleResult.warnings,
		};
	}
	if (role === "bashExecution") {
		const commandResult = parsePiCommandExecution({ message, sourceRef: options.sourceRef });
		return {
			messageCounts: roleResult.messageCounts,
			toolCalls: [],
			toolResults: [],
			commandExecutions:
				commandResult.commandExecution === null ? [] : [commandResult.commandExecution],
			usageEvents,
			warnings: [...roleResult.warnings, ...commandResult.warnings],
		};
	}

	return {
		messageCounts: roleResult.messageCounts,
		toolCalls: [],
		toolResults: [],
		commandExecutions: [],
		usageEvents,
		warnings: roleResult.warnings,
	};
}

function countMessageRole(options: { role: string | null; sourceRef: SessionSourceRef }): {
	messageCounts: SessionMessageCounts;
	warnings: readonly SessionWarning[];
} {
	if (options.role === "user") {
		return { messageCounts: { ...emptyMessageCounts(), user: 1 }, warnings: [] };
	}
	if (options.role === "assistant") {
		return { messageCounts: { ...emptyMessageCounts(), assistant: 1 }, warnings: [] };
	}
	if (options.role === "toolResult") {
		return { messageCounts: { ...emptyMessageCounts(), tool_result: 1 }, warnings: [] };
	}
	if (options.role === "bashExecution") {
		return { messageCounts: { ...emptyMessageCounts(), command_execution: 1 }, warnings: [] };
	}
	if (options.role === "system") {
		return { messageCounts: { ...emptyMessageCounts(), system: 1 }, warnings: [] };
	}
	return {
		messageCounts: { ...emptyMessageCounts(), other: 1 },
		warnings: [
			adapterWarning({
				code: "unknown_message_role",
				message: "Pi message record has an unknown or missing role.",
				sourceRef: options.sourceRef,
			}),
		],
	};
}

function parseToolCalls(options: {
	message: JsonObject;
	sourceRef: SessionSourceRef;
}): ParsedToolCallsContribution {
	const content = listValue(options.message, "content");
	if (content === null) {
		return { toolCalls: [], warnings: [] };
	}

	const toolCalls: SessionToolCall[] = [];
	const warnings: SessionWarning[] = [];
	for (const item of content) {
		const block = objectFromValue(item);
		if (block === null) continue;

		const blockType = stringValue(block, "type");
		if (blockType === null || !TOOL_CALL_TYPES.has(blockType)) {
			continue;
		}

		const toolName = stringValue(block, "name");
		if (toolName === null) {
			warnings.push(
				adapterWarning({
					code: "partial_tool_call",
					message: "Pi tool call block is missing a string name.",
					sourceRef: options.sourceRef,
				}),
			);
			continue;
		}

		const argumentsObj = objectValue(block, "arguments") ?? {};
		const argumentKeys = Object.keys(argumentsObj).sort();

		const command = stringValue(argumentsObj, "command") ?? stringValue(argumentsObj, "cmd");
		const path = stringValue(argumentsObj, "path") ?? stringValue(argumentsObj, "file_path");

		const callId = stringValue(block, "id") ?? "";
		toolCalls.push({
			call_id: callId,
			tool_name: toolName,
			argument_keys: argumentKeys,
			source_ref: options.sourceRef,
			...(command === null ? {} : { command }),
			...(path === null ? {} : { path }),
		});
	}
	return { toolCalls, warnings };
}

function parseToolResult(message: JsonObject, sourceRef: SessionSourceRef): SessionToolResult {
	const { textLength, lineCount } = textMetrics(message["content"]);
	const isError = boolValue(message, "isError") ?? false;
	const toolCallId =
		stringValue(message, "toolCallId") ?? stringValue(message, "tool_call_id") ?? "";
	const toolName = stringValue(message, "toolName") ?? stringValue(message, "tool_name");

	const result: SessionToolResult = {
		tool_call_id: toolCallId,
		tool_name: toolName,
		is_error: isError,
		error_message: null,
		text_length: textLength,
		line_count: lineCount,
		truncated: boolValue(message, "truncated"),
		source_ref: sourceRef,
	};

	return result;
}

function parsePiCommandExecution(options: {
	message: JsonObject;
	sourceRef: SessionSourceRef;
}): ParsedCommandExecutionContribution {
	const command = stringValue(options.message, "command");
	if (command === null) {
		return {
			commandExecution: null,
			warnings: [
				adapterWarning({
					code: "partial_command_execution",
					message: "Pi bash execution record is missing a string command.",
					sourceRef: options.sourceRef,
				}),
			],
		};
	}

	const { textLength, lineCount } = textMetrics(options.message["output"]);
	return {
		commandExecution: {
			command,
			exit_code: firstIntValue(options.message, ["exitCode", "exit_code"]),
			cancelled: boolValue(options.message, "cancelled"),
			truncated: boolValue(options.message, "truncated"),
			output_length: textLength,
			line_count: lineCount,
			source_ref: options.sourceRef,
		},
		warnings: [],
	};
}

function parseUsage(message: JsonObject, sourceRef: SessionSourceRef): SessionUsage | null {
	const usage = objectValue(message, "usage");
	if (usage === null) {
		return null;
	}

	const parsed: SessionUsage = {
		input_tokens: firstIntValue(usage, ["input", "inputTokens", "input_tokens"]),
		output_tokens: firstIntValue(usage, ["output", "outputTokens", "output_tokens"]),
		cache_read_tokens: firstIntValue(usage, ["cacheRead", "cacheReadTokens", "cache_read_tokens"]),
		cache_write_tokens: firstIntValue(usage, [
			"cacheWrite",
			"cacheWriteTokens",
			"cache_write_tokens",
		]),
		total_tokens: firstIntValue(usage, ["total", "totalTokens", "total_tokens"]),
		source_ref: sourceRef,
	};

	if (
		parsed.input_tokens === null &&
		parsed.output_tokens === null &&
		parsed.cache_read_tokens === null &&
		parsed.cache_write_tokens === null &&
		parsed.total_tokens === null
	) {
		return null;
	}

	return parsed;
}

function buildAssociation(opts: {
	repoRoot: string | null;
	cwd: string | null;
}): SessionAssociation {
	if (opts.cwd === null && opts.repoRoot === null) {
		return {
			repo_root: null,
			cwd: null,
			branch: null,
			confidence: "unknown",
			evidence: [],
		};
	}
	if (opts.cwd === null) {
		return {
			repo_root: opts.repoRoot,
			cwd: null,
			branch: null,
			confidence: "query_repo_root",
			evidence: ["query.repo_root"],
		};
	}
	if (opts.repoRoot === null) {
		return {
			repo_root: null,
			cwd: opts.cwd,
			branch: null,
			confidence: "cwd",
			evidence: ["session_header.cwd"],
		};
	}

	const confidence = sameOrChildPath(opts.cwd, opts.repoRoot) ? "repo_cwd" : "cwd_mismatch";
	return {
		repo_root: opts.repoRoot,
		cwd: opts.cwd,
		branch: null,
		confidence,
		evidence: ["query.repo_root", "session_header.cwd"],
	};
}

function sameOrChildPath(path: string, parent: string): boolean {
	const normalizedPath = resolve(path);
	const normalizedParent = resolve(parent);

	if (normalizedPath === normalizedParent) {
		return true;
	}

	const pathParts = normalizedPath.split(sep);
	const parentParts = normalizedParent.split(sep);

	if (pathParts.length < parentParts.length) {
		return false;
	}

	for (let i = 0; i < parentParts.length; i++) {
		if (pathParts[i] !== parentParts[i]) {
			return false;
		}
	}

	return true;
}

function textMetrics(value: unknown): { textLength: number | null; lineCount: number | null } {
	if (typeof value === "string") {
		return { textLength: value.length, lineCount: countLines(value) };
	}
	if (!Array.isArray(value)) {
		return { textLength: null, lineCount: null };
	}

	let totalLength = 0;
	let totalLines = 0;
	let foundText = false;

	for (const item of value) {
		if (typeof item === "string") {
			totalLength += item.length;
			totalLines += countLines(item);
			foundText = true;
			continue;
		}

		const block = objectFromValue(item);
		if (block === null) continue;
		if (stringValue(block, "type") !== "text") continue;

		const text = stringValue(block, "text");
		if (text === null) continue;

		totalLength += text.length;
		totalLines += countLines(text);
		foundText = true;
	}

	if (!foundText) {
		return { textLength: null, lineCount: null };
	}
	return { textLength: totalLength, lineCount: totalLines };
}

function countLines(text: string): number {
	if (text === "") {
		return 0;
	}
	return text.split("\n").length;
}

function maxIsoString(current: string | null, candidate: string | null): string | null {
	if (candidate === null) {
		return current;
	}
	if (current === null || candidate > current) {
		return candidate;
	}
	return current;
}

function adapterWarning(opts: {
	code: string;
	message: string;
	sourceRef: SessionSourceRef;
}): SessionWarning {
	return {
		code: opts.code,
		message: opts.message,
		source_ref: opts.sourceRef,
		harness: PI_SOURCE_INFO.harness,
		adapter_name: PI_SOURCE_INFO.adapter_name,
	};
}

function emptyMessageCounts(): MutableMessageCounts {
	return { user: 0, assistant: 0, tool_result: 0, command_execution: 0, system: 0, other: 0 };
}

function addMessageCounts(
	left: MutableMessageCounts,
	right: SessionMessageCounts,
): MutableMessageCounts {
	return {
		user: left.user + right.user,
		assistant: left.assistant + right.assistant,
		tool_result: left.tool_result + right.tool_result,
		command_execution: left.command_execution + right.command_execution,
		system: left.system + right.system,
		other: left.other + right.other,
	};
}

function freezeMessageCounts(counts: MutableMessageCounts): SessionMessageCounts {
	return {
		user: counts.user,
		assistant: counts.assistant,
		tool_result: counts.tool_result,
		command_execution: counts.command_execution,
		system: counts.system,
		other: counts.other,
	};
}

function objectValue(record: JsonObject, key: string): JsonObject | null {
	if (!(key in record)) {
		return null;
	}
	return objectFromValue(record[key]);
}

function objectFromValue(value: unknown): JsonObject | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const result: JsonObject = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof key === "string") {
			result[key] = item;
		}
	}
	return result;
}

function listValue(record: JsonObject, key: string): unknown[] | null {
	const value = record[key];
	if (!Array.isArray(value)) {
		return null;
	}
	return value;
}

function stringValue(record: JsonObject, key: string): string | null {
	const value = record[key];
	if (typeof value === "string") {
		return value;
	}
	return null;
}

function boolValue(record: JsonObject, key: string): boolean | null {
	const value = record[key];
	if (typeof value === "boolean") {
		return value;
	}
	return null;
}

function intValue(record: JsonObject, key: string): number | null {
	const value = record[key];
	if (typeof value === "boolean") {
		return null;
	}
	if (typeof value === "number" && Number.isInteger(value)) {
		return value;
	}
	return null;
}

function firstIntValue(record: JsonObject, keys: string[]): number | null {
	for (const key of keys) {
		const value = intValue(record, key);
		if (value !== null) {
			return value;
		}
	}
	return null;
}
