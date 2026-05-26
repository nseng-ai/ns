from __future__ import annotations

import json
from pathlib import Path

from asdl_core.sessions.types import (
    ParsedSession,
    SessionAssociation,
    SessionCommandExecution,
    SessionMessageCounts,
    SessionModelEvent,
    SessionQueryResult,
    SessionSourceInfo,
    SessionSourceRef,
    SessionToolCall,
    SessionToolResult,
    SessionUsage,
    SessionWarning,
)
from asdl_retro.exec.collect_evidence import (
    CollectEvidenceRequest,
    MessageCountsDto,
    RepoContextDto,
    SessionAssociationDto,
    SessionSourceRefDto,
    SessionSummaryDto,
    SessionWarningDto,
    _result_from_query_result,
    aggregate_metrics_from_summaries,
    summarize_session,
)


def test_summarize_session_converts_paths_and_keeps_only_counts() -> None:
    session = ParsedSession(
        source_info=SessionSourceInfo(harness="pi", adapter_name="pi_jsonl", record_format="jsonl"),
        source_ref=SessionSourceRef(path=Path("/tmp/sessions/s1.jsonl")),
        session_id="s1",
        started_at_iso="2026-01-01T00:00:00Z",
        ended_at_iso="2026-01-01T00:01:00Z",
        association=SessionAssociation(
            repo_root=Path("/repo"),
            cwd=Path("/repo"),
            branch=None,
            confidence="repo_cwd",
            evidence=("query.repo_root", "session_header.cwd"),
        ),
        message_counts=SessionMessageCounts(
            user=1,
            assistant=2,
            tool_result=3,
            command_execution=4,
            system=5,
            other=6,
        ),
        model_events=(SessionModelEvent(provider="anthropic", model="sonnet"),),
        tool_calls=(
            SessionToolCall(
                call_id="c1",
                tool_name="read",
                argument_keys=("path",),
                command="raw prompt command",
                path="secret.txt",
            ),
        ),
        tool_results=(
            SessionToolResult(
                tool_call_id="c1",
                tool_name="read",
                is_error=True,
                error_message="raw tool-output",
                text_length=99,
                line_count=7,
                truncated=False,
            ),
        ),
        command_executions=(
            SessionCommandExecution(
                command="echo classified",
                exit_code=0,
                cancelled=False,
                truncated=False,
                output_length=15,
                line_count=1,
            ),
        ),
        usage_events=(SessionUsage(input_tokens=10, output_tokens=5, total_tokens=15),),
        warnings=(SessionWarning(code="note", message="non-fatal"),),
    )

    summary = summarize_session(session)

    assert summary.source_ref.path == "/tmp/sessions/s1.jsonl"
    assert summary.association.repo_root == "/repo"
    assert summary.association.cwd == "/repo"
    assert summary.message_counts.user == 1
    assert summary.message_counts.assistant == 2
    assert summary.model_event_count == 1
    assert summary.tool_call_count == 1
    assert summary.tool_result_count == 1
    assert summary.command_execution_count == 1
    assert summary.usage_event_count == 1
    assert summary.warning_count == 1

    field_names = set(SessionSummaryDto.model_fields)
    assert "tool_calls" not in field_names
    assert "tool_results" not in field_names
    assert "command_executions" not in field_names
    assert "usage_events" not in field_names

    payload = json.dumps(summary.model_dump(mode="json"))
    assert "raw prompt command" not in payload
    assert "raw tool-output" not in payload
    assert "echo classified" not in payload
    assert "secret.txt" not in payload


def test_result_from_query_result_populates_evidence_items_and_omits_raw_errors() -> None:
    source_info = SessionSourceInfo(harness="fake", adapter_name="fake", record_format="memory")
    source_ref = SessionSourceRef(path=Path("/tmp/sessions/s1.jsonl"))
    session = ParsedSession(
        source_info=source_info,
        source_ref=source_ref,
        session_id="s1",
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
        tool_calls=(
            SessionToolCall(
                call_id="call-1",
                tool_name="read",
                argument_keys=("path",),
                source_ref=SessionSourceRef(path=Path("/tmp/sessions/s1.jsonl"), line_number=2),
                path="packages/foo.py",
            ),
        ),
        tool_results=(
            SessionToolResult(
                tool_call_id="call-1",
                tool_name="read",
                is_error=True,
                error_message="SECRET_RAW_ERROR_TEXT",
                text_length=42,
                line_count=1,
                truncated=False,
                source_ref=SessionSourceRef(path=Path("/tmp/sessions/s1.jsonl"), line_number=3),
            ),
        ),
        command_executions=(),
        usage_events=(SessionUsage(input_tokens=10, output_tokens=5, total_tokens=15),),
        warnings=(),
    )

    result = _result_from_query_result(
        request=CollectEvidenceRequest(),
        repo=RepoContextDto(
            repo_root="/repo",
            cwd="/repo",
            branch="feature/retro",
            branch_source="explicit",
        ),
        query_result=SessionQueryResult(source_info=source_info, sessions=(session,), warnings=()),
    )

    assert {item.kind for item in result.evidence_items} == {
        "tool_usage_count",
        "failed_tool_result",
        "token_usage_observed",
    }
    failed_tool_items = tuple(
        item for item in result.evidence_items if item.kind == "failed_tool_result"
    )
    assert len(failed_tool_items) == 1
    failed_tool = failed_tool_items[0]
    assert failed_tool.subject == "read"
    assert failed_tool.count == 1
    assert failed_tool.session_count == 1
    assert failed_tool.metadata == {"error_message_count": 1}
    assert failed_tool.source_refs == (
        SessionSourceRefDto(path="/tmp/sessions/s1.jsonl", uri=None, line_number=3),
    )
    assert "SECRET_RAW_ERROR_TEXT" not in json.dumps(result.model_dump(mode="json"))


def test_aggregate_metrics_from_multiple_session_summaries() -> None:
    first = _summary(
        session_id="s1",
        message_counts=MessageCountsDto(
            user=1,
            assistant=2,
            tool_result=3,
            command_execution=4,
            system=5,
            other=6,
        ),
        tool_call_count=7,
        tool_result_count=8,
        command_execution_count=9,
        usage_event_count=10,
        warning_count=11,
    )
    second = _summary(
        session_id="s2",
        message_counts=MessageCountsDto(
            user=10,
            assistant=20,
            tool_result=30,
            command_execution=40,
            system=50,
            other=60,
        ),
        tool_call_count=70,
        tool_result_count=80,
        command_execution_count=90,
        usage_event_count=100,
        warning_count=110,
    )
    warnings = (
        _warning("w1"),
        _warning("w2"),
        _warning("w3"),
    )

    metrics = aggregate_metrics_from_summaries((first, second), warnings)

    assert metrics.session_count == 2
    assert metrics.message_counts == MessageCountsDto(
        user=11,
        assistant=22,
        tool_result=33,
        command_execution=44,
        system=55,
        other=66,
    )
    assert metrics.tool_call_count == 77
    assert metrics.tool_result_count == 88
    assert metrics.command_execution_count == 99
    assert metrics.usage_event_count == 110
    assert metrics.warning_count == 3


def _summary(
    *,
    session_id: str,
    message_counts: MessageCountsDto,
    tool_call_count: int,
    tool_result_count: int,
    command_execution_count: int,
    usage_event_count: int,
    warning_count: int,
) -> SessionSummaryDto:
    return SessionSummaryDto(
        session_id=session_id,
        started_at_iso=None,
        ended_at_iso=None,
        source_ref=SessionSourceRefDto(path=f"/tmp/{session_id}.jsonl", uri=None, line_number=None),
        association=SessionAssociationDto(
            repo_root="/repo",
            cwd="/repo",
            branch=None,
            confidence="repo_cwd",
            evidence=("query.repo_root",),
        ),
        message_counts=message_counts,
        model_event_count=0,
        tool_call_count=tool_call_count,
        tool_result_count=tool_result_count,
        command_execution_count=command_execution_count,
        usage_event_count=usage_event_count,
        warning_count=warning_count,
    )


def _warning(code: str) -> SessionWarningDto:
    return SessionWarningDto(
        code=code,
        message="non-fatal",
        source_ref=None,
        harness="fake",
        adapter_name="fake",
    )
