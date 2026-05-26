"""Pi JSONL session source adapter."""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from asdl_core.sessions.source import SessionSource
from asdl_core.sessions.types import (
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
)

JsonObject = dict[str, object]

PI_SOURCE_INFO = SessionSourceInfo(
    harness="pi",
    adapter_name="pi_jsonl",
    record_format="jsonl",
)

_KNOWN_IGNORED_RECORD_TYPES = frozenset({"thinking_level_change", "custom_message"})
_TOOL_CALL_TYPES = frozenset({"toolCall", "tool_call", "tool_use"})


@dataclass
class _MutableMessageCounts:
    user: int = 0
    assistant: int = 0
    tool_result: int = 0
    command_execution: int = 0
    system: int = 0
    other: int = 0

    def freeze(self) -> SessionMessageCounts:
        return SessionMessageCounts(
            user=self.user,
            assistant=self.assistant,
            tool_result=self.tool_result,
            command_execution=self.command_execution,
            system=self.system,
            other=self.other,
        )


def default_pi_session_root() -> Path:
    """Return the default Pi session root without import-time filesystem work."""

    return Path.home() / ".pi" / "agent" / "sessions"


def encode_pi_session_dir_name(repo_root: Path) -> str:
    """Encode an absolute repo path using Pi's observed session directory convention."""

    stripped = repo_root.as_posix().strip("/")
    return f"--{stripped.replace('/', '-')}--"


def parse_pi_jsonl_session(path: Path, *, repo_root: Path | None = None) -> ParsedSession:
    """Parse one Pi JSONL session into harness-neutral facts."""

    warnings: list[SessionWarning] = []
    model_events: list[SessionModelEvent] = []
    tool_calls: list[SessionToolCall] = []
    tool_results: list[SessionToolResult] = []
    command_executions: list[SessionCommandExecution] = []
    usage_events: list[SessionUsage] = []
    counts = _MutableMessageCounts()
    session_id: str | None = None
    cwd: Path | None = None
    started_at_iso: str | None = None
    latest_timestamp: str | None = None
    saw_session_header = False

    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        source_ref = SessionSourceRef(path=path, line_number=line_number)
        decoded = _decode_json_object(raw_line, source_ref, warnings)
        if decoded is None:
            continue

        timestamp = _string_value(decoded, "timestamp")
        latest_timestamp = _max_iso_string(latest_timestamp, timestamp)
        record_type = _string_value(decoded, "type")
        if record_type == "session":
            saw_session_header = True
            session_id = _string_value(decoded, "id")
            started_at_iso = timestamp
            cwd = _path_value(decoded, "cwd")
        elif record_type == "model_change":
            model_events.append(_parse_pi_model_event(decoded, source_ref))
        elif record_type == "message":
            _parse_pi_message(
                decoded,
                source_ref,
                counts,
                tool_calls,
                tool_results,
                command_executions,
                usage_events,
                warnings,
            )
        elif record_type == "bashExecution":
            counts.command_execution += 1
            _parse_pi_command_execution(decoded, source_ref, command_executions, warnings)
        elif record_type in _KNOWN_IGNORED_RECORD_TYPES:
            continue
        elif record_type is None:
            warnings.append(
                _adapter_warning(
                    code="unknown_record_shape",
                    message="Pi JSONL record is missing a string type field.",
                    source_ref=source_ref,
                )
            )
        else:
            warnings.append(
                _adapter_warning(
                    code="unknown_record_type",
                    message=f"Ignoring unsupported Pi JSONL record type: {record_type}.",
                    source_ref=source_ref,
                )
            )

    if not saw_session_header:
        warnings.append(
            _adapter_warning(
                code="missing_session_header",
                message="Pi JSONL file did not contain a session header record.",
                source_ref=SessionSourceRef(path=path),
            )
        )

    return ParsedSession(
        source_info=PI_SOURCE_INFO,
        source_ref=SessionSourceRef(path=path),
        session_id=session_id,
        started_at_iso=started_at_iso,
        ended_at_iso=latest_timestamp,
        association=_association(repo_root=repo_root, cwd=cwd),
        message_counts=counts.freeze(),
        model_events=tuple(model_events),
        tool_calls=tuple(tool_calls),
        tool_results=tuple(tool_results),
        command_executions=tuple(command_executions),
        usage_events=tuple(usage_events),
        warnings=tuple(warnings),
    )


class PiJsonlSessionSource(SessionSource):
    """Session source backed by Pi's local JSONL session files."""

    @property
    def source_info(self) -> SessionSourceInfo:
        return PI_SOURCE_INFO

    def query(self, query: SessionQuery) -> SessionQueryResult:
        if query.harnesses and PI_SOURCE_INFO.harness not in query.harnesses:
            return SessionQueryResult(source_info=PI_SOURCE_INFO, sessions=(), warnings=())

        session_root = query.session_root or default_pi_session_root()
        if not session_root.exists():
            return _warning_result(
                code="session_root_missing",
                message=f"Pi session root does not exist: {session_root}",
                path=session_root,
            )
        if not session_root.is_dir():
            return _warning_result(
                code="session_root_not_directory",
                message=f"Pi session root is not a directory: {session_root}",
                path=session_root,
            )

        repo_session_dir = session_root / encode_pi_session_dir_name(query.repo_root)
        if not repo_session_dir.exists():
            return _warning_result(
                code="repo_session_dir_missing",
                message=f"Pi session directory does not exist for repo: {query.repo_root}",
                path=repo_session_dir,
            )
        if not repo_session_dir.is_dir():
            return _warning_result(
                code="repo_session_dir_not_directory",
                message=f"Pi session path is not a directory: {repo_session_dir}",
                path=repo_session_dir,
            )

        sessions = tuple(
            _limit_sessions(
                _filter_sessions(
                    (
                        parse_pi_jsonl_session(path, repo_root=query.repo_root)
                        for path in sorted(repo_session_dir.glob("*.jsonl"), reverse=True)
                    ),
                    query,
                ),
                query.max_sessions,
            )
        )
        warnings = tuple(warning for session in sessions for warning in session.warnings)
        return SessionQueryResult(source_info=PI_SOURCE_INFO, sessions=sessions, warnings=warnings)


def _warning_result(*, code: str, message: str, path: Path) -> SessionQueryResult:
    warning = _adapter_warning(
        code=code,
        message=message,
        source_ref=SessionSourceRef(path=path),
    )
    return SessionQueryResult(source_info=PI_SOURCE_INFO, sessions=(), warnings=(warning,))


def _filter_sessions(
    sessions: Iterable[ParsedSession],
    query: SessionQuery,
) -> tuple[ParsedSession, ...]:
    filtered: list[ParsedSession] = []
    for session in sessions:
        timestamp = session.started_at_iso or session.ended_at_iso
        if query.since_iso is not None and timestamp is not None and timestamp < query.since_iso:
            continue
        if query.until_iso is not None and timestamp is not None and timestamp > query.until_iso:
            continue
        filtered.append(session)
    return tuple(filtered)


def _limit_sessions(
    sessions: tuple[ParsedSession, ...],
    max_sessions: int | None,
) -> tuple[ParsedSession, ...]:
    if max_sessions is None:
        return sessions
    if max_sessions <= 0:
        return ()
    return sessions[:max_sessions]


def _decode_json_object(
    raw_line: str,
    source_ref: SessionSourceRef,
    warnings: list[SessionWarning],
) -> JsonObject | None:
    if raw_line.strip() == "":
        return None

    try:
        decoded = json.loads(raw_line)
    except json.JSONDecodeError as exc:
        warnings.append(
            _adapter_warning(
                code="malformed_json",
                message=f"Could not decode Pi JSONL line: {exc.msg}.",
                source_ref=source_ref,
            )
        )
        return None

    return _coerce_json_object(decoded, source_ref, warnings)


def _coerce_json_object(
    value: object,
    source_ref: SessionSourceRef,
    warnings: list[SessionWarning],
) -> JsonObject | None:
    if not isinstance(value, dict):
        warnings.append(
            _adapter_warning(
                code="unknown_record_shape",
                message="Pi JSONL line decoded to a non-object value.",
                source_ref=source_ref,
            )
        )
        return None

    result: JsonObject = {}
    for key, item in value.items():
        if isinstance(key, str):
            result[key] = item
    return result


def _parse_pi_model_event(record: JsonObject, source_ref: SessionSourceRef) -> SessionModelEvent:
    model_object = _object_value(record, "model")
    provider = _string_value(record, "provider")
    model = _string_value(record, "model")
    if model_object is not None:
        provider = provider or _string_value(model_object, "provider")
        model = (
            _string_value(model_object, "id")
            or _string_value(model_object, "name")
            or _string_value(model_object, "model")
            or model
        )
    return SessionModelEvent(provider=provider, model=model, source_ref=source_ref)


def _parse_pi_message(
    record: JsonObject,
    source_ref: SessionSourceRef,
    counts: _MutableMessageCounts,
    tool_calls: list[SessionToolCall],
    tool_results: list[SessionToolResult],
    command_executions: list[SessionCommandExecution],
    usage_events: list[SessionUsage],
    warnings: list[SessionWarning],
) -> None:
    message = _object_value(record, "message")
    if message is None:
        counts.other += 1
        warnings.append(
            _adapter_warning(
                code="partial_record",
                message="Pi message record is missing an object message field.",
                source_ref=source_ref,
            )
        )
        return

    role = _string_value(message, "role")
    _count_message_role(role, counts, source_ref, warnings)

    usage = _parse_usage(message, source_ref)
    if usage is not None:
        usage_events.append(usage)

    if role == "assistant":
        _parse_tool_calls(message, source_ref, tool_calls, warnings)
    elif role == "toolResult":
        tool_results.append(_parse_tool_result(message, source_ref))
    elif role == "bashExecution":
        _parse_pi_command_execution(message, source_ref, command_executions, warnings)


def _count_message_role(
    role: str | None,
    counts: _MutableMessageCounts,
    source_ref: SessionSourceRef,
    warnings: list[SessionWarning],
) -> None:
    if role == "user":
        counts.user += 1
    elif role == "assistant":
        counts.assistant += 1
    elif role == "toolResult":
        counts.tool_result += 1
    elif role == "bashExecution":
        counts.command_execution += 1
    elif role == "system":
        counts.system += 1
    else:
        counts.other += 1
        warnings.append(
            _adapter_warning(
                code="unknown_message_role",
                message="Pi message record has an unknown or missing role.",
                source_ref=source_ref,
            )
        )


def _parse_tool_calls(
    message: JsonObject,
    source_ref: SessionSourceRef,
    tool_calls: list[SessionToolCall],
    warnings: list[SessionWarning],
) -> None:
    content = _list_value(message, "content")
    if content is None:
        return

    for item in content:
        block = _object_from_value(item)
        if block is None or _string_value(block, "type") not in _TOOL_CALL_TYPES:
            continue

        tool_name = _string_value(block, "name")
        if tool_name is None:
            warnings.append(
                _adapter_warning(
                    code="partial_tool_call",
                    message="Pi tool call block is missing a string name.",
                    source_ref=source_ref,
                )
            )
            continue

        arguments = _object_value(block, "arguments") or {}
        tool_calls.append(
            SessionToolCall(
                call_id=_string_value(block, "id"),
                tool_name=tool_name,
                argument_keys=tuple(sorted(arguments.keys())),
                source_ref=source_ref,
                command=_string_value(arguments, "command") or _string_value(arguments, "cmd"),
                path=_string_value(arguments, "path") or _string_value(arguments, "file_path"),
            )
        )


def _parse_tool_result(message: JsonObject, source_ref: SessionSourceRef) -> SessionToolResult:
    text_length, line_count = _text_metrics(message.get("content"))
    return SessionToolResult(
        tool_call_id=_string_value(message, "toolCallId") or _string_value(message, "tool_call_id"),
        tool_name=_string_value(message, "toolName") or _string_value(message, "tool_name"),
        is_error=_bool_value(message, "isError") or False,
        error_message=_string_value(message, "errorMessage") or _string_value(message, "error"),
        text_length=text_length,
        line_count=line_count,
        truncated=_bool_value(message, "truncated"),
        source_ref=source_ref,
    )


def _parse_pi_command_execution(
    message: JsonObject,
    source_ref: SessionSourceRef,
    command_executions: list[SessionCommandExecution],
    warnings: list[SessionWarning],
) -> None:
    command = _string_value(message, "command")
    if command is None:
        warnings.append(
            _adapter_warning(
                code="partial_command_execution",
                message="Pi bash execution record is missing a string command.",
                source_ref=source_ref,
            )
        )
        return

    output_length, line_count = _text_metrics(message.get("output"))
    command_executions.append(
        SessionCommandExecution(
            command=command,
            exit_code=_first_int_value(message, ("exitCode", "exit_code")),
            cancelled=_bool_value(message, "cancelled"),
            truncated=_bool_value(message, "truncated"),
            output_length=output_length,
            line_count=line_count,
            source_ref=source_ref,
        )
    )


def _parse_usage(message: JsonObject, source_ref: SessionSourceRef) -> SessionUsage | None:
    usage = _object_value(message, "usage")
    if usage is None:
        return None

    parsed = SessionUsage(
        input_tokens=_first_int_value(usage, ("input", "inputTokens", "input_tokens")),
        output_tokens=_first_int_value(usage, ("output", "outputTokens", "output_tokens")),
        cache_read_tokens=_first_int_value(
            usage,
            ("cacheRead", "cacheReadTokens", "cache_read_tokens"),
        ),
        cache_write_tokens=_first_int_value(
            usage,
            ("cacheWrite", "cacheWriteTokens", "cache_write_tokens"),
        ),
        total_tokens=_first_int_value(usage, ("total", "totalTokens", "total_tokens")),
        source_ref=source_ref,
    )
    if (
        parsed.input_tokens is None
        and parsed.output_tokens is None
        and parsed.cache_read_tokens is None
        and parsed.cache_write_tokens is None
        and parsed.total_tokens is None
    ):
        return None
    return parsed


def _association(*, repo_root: Path | None, cwd: Path | None) -> SessionAssociation:
    if cwd is None and repo_root is None:
        return SessionAssociation(
            repo_root=None,
            cwd=None,
            branch=None,
            confidence="unknown",
            evidence=(),
        )
    if cwd is None:
        return SessionAssociation(
            repo_root=repo_root,
            cwd=None,
            branch=None,
            confidence="query_repo_root",
            evidence=("query.repo_root",),
        )
    if repo_root is None:
        return SessionAssociation(
            repo_root=None,
            cwd=cwd,
            branch=None,
            confidence="cwd",
            evidence=("session_header.cwd",),
        )

    confidence = "repo_cwd" if _same_or_child_path(cwd, repo_root) else "cwd_mismatch"
    return SessionAssociation(
        repo_root=repo_root,
        cwd=cwd,
        branch=None,
        confidence=confidence,
        evidence=("query.repo_root", "session_header.cwd"),
    )


def _same_or_child_path(path: Path, parent: Path) -> bool:
    if path == parent:
        return True
    return path.parts[: len(parent.parts)] == parent.parts


def _text_metrics(value: object) -> tuple[int | None, int | None]:
    if isinstance(value, str):
        return len(value), _line_count(value)
    if not isinstance(value, list):
        return None, None

    total_length = 0
    total_lines = 0
    found_text = False
    for item in value:
        if isinstance(item, str):
            total_length += len(item)
            total_lines += _line_count(item)
            found_text = True
            continue
        block = _object_from_value(item)
        if block is None or _string_value(block, "type") != "text":
            continue
        text = _string_value(block, "text")
        if text is None:
            continue
        total_length += len(text)
        total_lines += _line_count(text)
        found_text = True

    if not found_text:
        return None, None
    return total_length, total_lines


def _line_count(text: str) -> int:
    if text == "":
        return 0
    return len(text.splitlines())


def _max_iso_string(current: str | None, candidate: str | None) -> str | None:
    if candidate is None:
        return current
    if current is None or candidate > current:
        return candidate
    return current


def _adapter_warning(*, code: str, message: str, source_ref: SessionSourceRef) -> SessionWarning:
    return SessionWarning(
        code=code,
        message=message,
        source_ref=source_ref,
        harness=PI_SOURCE_INFO.harness,
        adapter_name=PI_SOURCE_INFO.adapter_name,
    )


def _object_value(record: JsonObject, key: str) -> JsonObject | None:
    if key not in record:
        return None
    return _object_from_value(record[key])


def _object_from_value(value: object) -> JsonObject | None:
    if not isinstance(value, dict):
        return None
    result: JsonObject = {}
    for key, item in value.items():
        if isinstance(key, str):
            result[key] = item
    return result


def _list_value(record: JsonObject, key: str) -> list[object] | None:
    value = record.get(key)
    if not isinstance(value, list):
        return None

    result: list[object] = []
    for item in value:
        result.append(item)
    return result


def _string_value(record: JsonObject, key: str) -> str | None:
    value = record.get(key)
    if isinstance(value, str):
        return value
    return None


def _path_value(record: JsonObject, key: str) -> Path | None:
    value = _string_value(record, key)
    if value is None:
        return None
    return Path(value)


def _bool_value(record: JsonObject, key: str) -> bool | None:
    value = record.get(key)
    if isinstance(value, bool):
        return value
    return None


def _int_value(record: JsonObject, key: str) -> int | None:
    value = record.get(key)
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


def _first_int_value(record: JsonObject, keys: tuple[str, ...]) -> int | None:
    for key in keys:
        value = _int_value(record, key)
        if value is not None:
            return value
    return None
