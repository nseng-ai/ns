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
	confidence: string;
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
	provider: string;
	model: string;
}

export interface SessionToolCall {
	call_id: string;
	tool_name: string;
	argument_keys: readonly string[];
	source_ref: SessionSourceRef | null;
	command?: string | undefined;
	path?: string | undefined;
}

export interface SessionToolResult {
	tool_call_id: string;
	tool_name: string | null;
	is_error: boolean;
	error_message: string | null;
	text_length: number | null;
	line_count: number | null;
	truncated: boolean | null;
	source_ref: SessionSourceRef | null;
}

export interface SessionCommandExecution {
	command: string;
	exit_code: number | null;
	cancelled: boolean | null;
	truncated: boolean | null;
	output_length: number | null;
	line_count: number | null;
	source_ref: SessionSourceRef | null;
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
