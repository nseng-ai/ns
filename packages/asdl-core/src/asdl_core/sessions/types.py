"""Harness-neutral session parsing models."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class SessionSourceInfo:
    """Identity for one harness adapter."""

    harness: str
    adapter_name: str
    record_format: str


@dataclass(frozen=True)
class SessionSourceRef:
    """Reference to source material without embedding raw transcript content."""

    path: Path | None = None
    uri: str | None = None
    line_number: int | None = None


@dataclass(frozen=True)
class SessionQuery:
    """Request for sessions associated with a repository or worktree."""

    repo_root: Path
    session_root: Path | None = None
    max_sessions: int | None = None
    since_iso: str | None = None
    until_iso: str | None = None
    harnesses: tuple[str, ...] = ()


@dataclass(frozen=True)
class SessionWarning:
    """Non-fatal issue encountered while discovering or parsing sessions."""

    code: str
    message: str
    source_ref: SessionSourceRef | None = None
    harness: str | None = None
    adapter_name: str | None = None


@dataclass(frozen=True)
class SessionAssociation:
    """Conservative evidence connecting a session to repo/worktree/branch context."""

    repo_root: Path | None
    cwd: Path | None
    branch: str | None
    confidence: str
    evidence: tuple[str, ...]


@dataclass(frozen=True)
class SessionMessageCounts:
    """Counts of normalized message/activity classes."""

    user: int = 0
    assistant: int = 0
    tool_result: int = 0
    command_execution: int = 0
    system: int = 0
    other: int = 0


@dataclass(frozen=True)
class SessionModelEvent:
    """Model/provider metadata observed in a session."""

    provider: str | None
    model: str | None
    source_ref: SessionSourceRef | None = None


@dataclass(frozen=True)
class SessionToolCall:
    """Normalized tool call metadata without raw transcript text."""

    call_id: str | None
    tool_name: str
    argument_keys: tuple[str, ...]
    source_ref: SessionSourceRef | None = None
    command: str | None = None
    path: str | None = None


@dataclass(frozen=True)
class SessionToolResult:
    """Normalized tool result metadata without retaining result content."""

    tool_call_id: str | None
    tool_name: str | None
    is_error: bool
    error_message: str | None
    text_length: int | None
    line_count: int | None
    truncated: bool | None
    source_ref: SessionSourceRef | None = None


@dataclass(frozen=True)
class SessionCommandExecution:
    """Normalized shell command execution metadata."""

    command: str
    exit_code: int | None
    cancelled: bool | None
    truncated: bool | None
    output_length: int | None
    line_count: int | None
    source_ref: SessionSourceRef | None = None


@dataclass(frozen=True)
class SessionUsage:
    """Token usage counters when a harness records them."""

    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_write_tokens: int | None = None
    total_tokens: int | None = None
    source_ref: SessionSourceRef | None = None


@dataclass(frozen=True)
class ParsedSession:
    """One parsed session represented as compact normalized facts."""

    source_info: SessionSourceInfo
    source_ref: SessionSourceRef
    session_id: str | None
    started_at_iso: str | None
    ended_at_iso: str | None
    association: SessionAssociation
    message_counts: SessionMessageCounts
    model_events: tuple[SessionModelEvent, ...]
    tool_calls: tuple[SessionToolCall, ...]
    tool_results: tuple[SessionToolResult, ...]
    command_executions: tuple[SessionCommandExecution, ...]
    usage_events: tuple[SessionUsage, ...]
    warnings: tuple[SessionWarning, ...]


@dataclass(frozen=True)
class SessionQueryResult:
    """Result of querying one session source."""

    source_info: SessionSourceInfo
    sessions: tuple[ParsedSession, ...]
    warnings: tuple[SessionWarning, ...]
