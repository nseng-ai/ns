"""Tests for deterministic session evidence aggregation."""

from __future__ import annotations

from pathlib import Path

from asdl_core.sessions.evidence import SessionEvidenceItem, collect_session_evidence
from asdl_core.sessions.types import (
    ParsedSession,
    SessionAssociation,
    SessionCommandExecution,
    SessionMessageCounts,
    SessionSourceInfo,
    SessionSourceRef,
    SessionToolCall,
    SessionToolResult,
    SessionUsage,
)


def test_collect_session_evidence_empty_sessions_returns_empty_tuple() -> None:
    assert collect_session_evidence(()) == ()


def test_tool_usage_counts_group_by_tool_name_and_sort_by_count() -> None:
    sessions = (
        _session(
            "s1",
            tool_calls=(
                _tool_call("read", line=2),
                _tool_call("bash", line=3),
            ),
        ),
        _session("s2", tool_calls=(_tool_call("read", line=4),)),
    )

    items = _items_by_kind(collect_session_evidence(sessions), "tool_usage_count")

    assert [item.subject for item in items] == ["read", "bash"]
    assert items[0].count == 2
    assert items[0].session_count == 2
    assert items[0].summary == "read called 2 times across 2 sessions"
    assert [ref.line_number for ref in items[0].source_refs] == [2, 4]
    assert items[1].count == 1
    assert items[1].session_count == 1


def test_failed_tool_results_group_by_tool_name_and_omit_error_text() -> None:
    sessions = (
        _session(
            "s1",
            tool_results=(
                _tool_result(
                    tool_name="bash",
                    is_error=True,
                    error_message="SECRET raw error output",
                    line=5,
                ),
                _tool_result(tool_name="bash", is_error=False, line=6),
                _tool_result(tool_name=None, is_error=True, line=7),
            ),
        ),
        _session(
            "s2",
            tool_results=(
                _tool_result(tool_name="bash", is_error=True, error_message=None, line=8),
            ),
        ),
    )

    items = _items_by_kind(collect_session_evidence(sessions), "failed_tool_result")

    assert [item.subject for item in items] == ["bash", "unknown_tool"]
    assert items[0].count == 2
    assert items[0].session_count == 2
    assert dict(items[0].metadata) == {"error_message_count": 1}
    assert "SECRET" not in str(items[0])
    assert items[1].count == 1
    assert items[1].session_count == 1


def test_repeated_file_reads_respect_threshold() -> None:
    sessions = (
        _session(
            "s1",
            tool_calls=(
                _tool_call("read", path="packages/foo.py", line=2),
                _tool_call("read", path="packages/bar.py", line=3),
            ),
        ),
        _session("s2", tool_calls=(_tool_call("read", path="packages/foo.py", line=4),)),
    )

    items = _items_by_kind(
        collect_session_evidence(sessions, repeated_file_read_threshold=2),
        "repeated_file_read",
    )

    assert len(items) == 1
    assert items[0].subject == "packages/foo.py"
    assert items[0].count == 2
    assert items[0].session_count == 2
    assert items[0].summary == "packages/foo.py read 2 times across 2 sessions"


def test_repeated_shell_commands_use_exact_command_subject_and_threshold() -> None:
    sessions = (
        _session(
            "s1",
            tool_calls=(
                _tool_call("bash", command="uv run pytest", line=2),
                _tool_call("bash", command="just", line=3),
            ),
            command_executions=(_command_execution(command="uv run pytest", line=4),),
        ),
        _session("s2", command_executions=(_command_execution(command="uv  run pytest", line=5),)),
    )

    items = _items_by_kind(
        collect_session_evidence(sessions, repeated_shell_command_threshold=2),
        "repeated_shell_command",
    )

    assert len(items) == 1
    assert items[0].subject == "uv run pytest"
    assert items[0].count == 2
    assert items[0].session_count == 1
    assert items[0].source_refs == (
        SessionSourceRef(path=Path("/tmp/s1.jsonl"), line_number=4),
        SessionSourceRef(path=Path("/tmp/s1.jsonl"), line_number=2),
    )


def test_token_usage_sums_only_present_counters() -> None:
    sessions = (
        _session("s1", usage_events=(_usage(input_tokens=10, total_tokens=None, line=2),)),
        _session(
            "s2",
            usage_events=(_usage(output_tokens=3, cache_read_tokens=2, total_tokens=9, line=3),),
        ),
    )

    items = _items_by_kind(collect_session_evidence(sessions), "token_usage_observed")

    assert len(items) == 1
    assert items[0].subject == "token_usage"
    assert items[0].count == 2
    assert items[0].session_count == 2
    assert dict(items[0].metadata) == {
        "usage_event_count": 2,
        "input_tokens": 10,
        "output_tokens": 3,
        "cache_read_tokens": 2,
        "total_tokens": 9,
    }
    assert "cache_write_tokens" not in items[0].metadata


def test_large_outputs_detect_char_threshold_line_threshold_and_truncation() -> None:
    sessions = (
        _session(
            "s1",
            tool_results=(
                _tool_result(
                    tool_name="read",
                    text_length=50,
                    line_count=12,
                    truncated=False,
                    line=2,
                ),
                _tool_result(
                    tool_name="read",
                    text_length=5,
                    line_count=1,
                    truncated=True,
                    line=3,
                ),
            ),
            command_executions=(
                _command_execution(
                    command="generate output",
                    output_length=150,
                    line_count=2,
                    truncated=False,
                    line=4,
                ),
            ),
        ),
    )

    items = _items_by_kind(
        collect_session_evidence(
            sessions,
            large_output_line_threshold=10,
            large_output_char_threshold=100,
        ),
        "large_output_observed",
    )

    assert [item.subject for item in items] == ["tool_result:read", "command_execution"]
    assert items[0].count == 2
    assert dict(items[0].metadata) == {
        "truncated_count": 1,
        "char_threshold_hits": 0,
        "line_threshold_hits": 1,
        "max_output_length": 50,
        "max_line_count": 12,
    }
    assert items[1].count == 1
    assert dict(items[1].metadata) == {
        "truncated_count": 0,
        "char_threshold_hits": 1,
        "line_threshold_hits": 0,
        "max_output_length": 150,
        "max_line_count": 2,
    }


def test_source_refs_are_capped_per_evidence_item() -> None:
    sessions = (
        _session(
            "s1",
            tool_calls=(
                _tool_call("read", line=2),
                _tool_call("read", line=3),
                _tool_call("read", line=4),
            ),
        ),
    )

    items = _items_by_kind(
        collect_session_evidence(sessions, max_source_refs_per_item=2),
        "tool_usage_count",
    )

    assert items[0].count == 3
    assert items[0].source_refs == (
        SessionSourceRef(path=Path("/tmp/s1.jsonl"), line_number=2),
        SessionSourceRef(path=Path("/tmp/s1.jsonl"), line_number=3),
    )


def test_evidence_items_do_not_include_raw_tool_output_text() -> None:
    sessions = (
        _session(
            "s1",
            tool_results=(
                _tool_result(
                    tool_name="read",
                    is_error=True,
                    error_message="SECRET_TOOL_OUTPUT_TEXT",
                    text_length=10_000,
                    line_count=1,
                    line=2,
                ),
            ),
        ),
    )

    items = collect_session_evidence(sessions, large_output_char_threshold=100)

    assert items
    assert "SECRET_TOOL_OUTPUT_TEXT" not in str(items)


def _items_by_kind(
    items: tuple[SessionEvidenceItem, ...],
    kind: str,
) -> tuple[SessionEvidenceItem, ...]:
    return tuple(item for item in items if item.kind == kind)


def _session(
    session_id: str,
    *,
    tool_calls: tuple[SessionToolCall, ...] = (),
    tool_results: tuple[SessionToolResult, ...] = (),
    command_executions: tuple[SessionCommandExecution, ...] = (),
    usage_events: tuple[SessionUsage, ...] = (),
) -> ParsedSession:
    return ParsedSession(
        source_info=SessionSourceInfo(harness="fake", adapter_name="fake", record_format="memory"),
        source_ref=SessionSourceRef(path=Path(f"/tmp/{session_id}.jsonl")),
        session_id=session_id,
        started_at_iso=None,
        ended_at_iso=None,
        association=SessionAssociation(
            repo_root=Path("/repo"),
            cwd=Path("/repo"),
            branch=None,
            confidence="repo_cwd",
            evidence=("query.repo_root", "session_header.cwd"),
        ),
        message_counts=SessionMessageCounts(),
        model_events=(),
        tool_calls=tool_calls,
        tool_results=tool_results,
        command_executions=command_executions,
        usage_events=usage_events,
        warnings=(),
    )


def _tool_call(
    tool_name: str,
    *,
    command: str | None = None,
    path: str | None = None,
    line: int,
) -> SessionToolCall:
    return SessionToolCall(
        call_id=None,
        tool_name=tool_name,
        argument_keys=(),
        source_ref=SessionSourceRef(path=Path("/tmp/s1.jsonl"), line_number=line),
        command=command,
        path=path,
    )


def _tool_result(
    *,
    tool_name: str | None,
    is_error: bool = False,
    error_message: str | None = None,
    text_length: int | None = None,
    line_count: int | None = None,
    truncated: bool | None = None,
    line: int,
) -> SessionToolResult:
    return SessionToolResult(
        tool_call_id=None,
        tool_name=tool_name,
        is_error=is_error,
        error_message=error_message,
        text_length=text_length,
        line_count=line_count,
        truncated=truncated,
        source_ref=SessionSourceRef(path=Path("/tmp/s1.jsonl"), line_number=line),
    )


def _command_execution(
    *,
    command: str,
    output_length: int | None = None,
    line_count: int | None = None,
    truncated: bool | None = None,
    line: int,
) -> SessionCommandExecution:
    return SessionCommandExecution(
        command=command,
        exit_code=0,
        cancelled=False,
        truncated=truncated,
        output_length=output_length,
        line_count=line_count,
        source_ref=SessionSourceRef(path=Path("/tmp/s1.jsonl"), line_number=line),
    )


def _usage(
    *,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    cache_read_tokens: int | None = None,
    cache_write_tokens: int | None = None,
    total_tokens: int | None = None,
    line: int,
) -> SessionUsage:
    return SessionUsage(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_read_tokens=cache_read_tokens,
        cache_write_tokens=cache_write_tokens,
        total_tokens=total_tokens,
        source_ref=SessionSourceRef(path=Path("/tmp/s1.jsonl"), line_number=line),
    )
