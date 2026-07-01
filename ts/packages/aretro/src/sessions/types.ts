export interface SessionSourceInfo {
	harness: string;
	adapter_name: string;
	record_format: string;
}

export interface SessionSourceRef {
	path: string | null;
	uri: string | null;
	line_number: number | null;
}

export const SESSION_ASSOCIATION_CONFIDENCES = [
	"unknown",
	"query-repo-root",
	"cwd",
	"repo-cwd",
	"repo_cwd",
	"cwd-mismatch",
] as const;

export type SessionAssociationConfidence = (typeof SESSION_ASSOCIATION_CONFIDENCES)[number];

export interface TruncatableOutput {
	length: number | null;
	line_count: number | null;
	truncated: boolean | null;
	source_ref: SessionSourceRef | null;
}

export interface SessionWarning {
	code: string;
	message: string;
	source_ref: SessionSourceRef | null;
	harness: string | null;
	adapter_name: string | null;
}

export interface SessionAssociation {
	repo_root: string | null;
	cwd: string | null;
	branch: string | null;
	confidence: SessionAssociationConfidence;
	evidence: readonly string[];
}

export interface SessionMessageCounts {
	user: number;
	assistant: number;
	tool_result: number;
	command_execution: number;
	system: number;
	other: number;
}

export interface SessionModelEvent {
	provider: string | null;
	model: string | null;
	source_ref?: SessionSourceRef | null;
}

export interface SessionToolCall {
	call_id: string | null;
	tool_name: string;
	argument_keys: readonly string[];
	source_ref: SessionSourceRef | null;
	command?: string;
	path?: string;
}

export interface SessionToolResult {
	tool_call_id: string | null;
	tool_name: string | null;
	is_error: boolean;
	error_message: string | null;
	output?: TruncatableOutput;
	text_length: number | null;
	line_count: number | null;
	truncated: boolean | null;
	source_ref: SessionSourceRef | null;
}

export interface SessionCommandExecution {
	command: string;
	exit_code: number | null;
	cancelled: boolean | null;
	output?: TruncatableOutput;
	output_length: number | null;
	line_count: number | null;
	truncated: boolean | null;
	source_ref: SessionSourceRef | null;
}

export function sessionToolResultOutput(result: SessionToolResult): TruncatableOutput {
	return (
		result.output ?? {
			length: result.text_length,
			line_count: result.line_count,
			truncated: result.truncated,
			source_ref: result.source_ref,
		}
	);
}

export function sessionCommandExecutionOutput(
	execution: SessionCommandExecution,
): TruncatableOutput {
	return (
		execution.output ?? {
			length: execution.output_length,
			line_count: execution.line_count,
			truncated: execution.truncated,
			source_ref: execution.source_ref,
		}
	);
}

export interface SessionUsage {
	input_tokens: number | null;
	output_tokens: number | null;
	cache_read_tokens: number | null;
	cache_write_tokens: number | null;
	total_tokens: number | null;
	source_ref: SessionSourceRef | null;
}

export interface ParsedSession {
	source_info: SessionSourceInfo;
	source_ref: SessionSourceRef;
	session_id: string | null;
	started_at_iso: string | null;
	ended_at_iso: string | null;
	association: SessionAssociation;
	message_counts: SessionMessageCounts;
	model_events: readonly SessionModelEvent[];
	tool_calls: readonly SessionToolCall[];
	tool_results: readonly SessionToolResult[];
	command_executions: readonly SessionCommandExecution[];
	usage_events: readonly SessionUsage[];
	warnings: readonly SessionWarning[];
}

export interface SessionQuery {
	repo_root: string;
	session_root: string | null;
	max_sessions: number;
}

export interface SessionQueryResult {
	source_info: SessionSourceInfo;
	sessions: readonly ParsedSession[];
	warnings: readonly SessionWarning[];
}
