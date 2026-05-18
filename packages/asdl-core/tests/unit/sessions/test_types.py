"""Tests for harness-neutral session dataclasses."""

from __future__ import annotations

from dataclasses import fields
from pathlib import Path

import pytest

from asdl_core.sessions.types import (
    ParsedSession,
    SessionAssociation,
    SessionMessageCounts,
    SessionQuery,
    SessionQueryResult,
    SessionSourceInfo,
    SessionSourceRef,
    SessionToolCall,
    SessionUsage,
    SessionWarning,
)


def test_session_source_info_is_frozen() -> None:
    info = SessionSourceInfo(harness="pi", adapter_name="pi_jsonl", record_format="jsonl")

    with pytest.raises(AttributeError):
        # Test subject: unknown-attr assignment on a frozen dataclass.
        info.harness = "claude-code"  # type: ignore[misc]


def test_source_info_distinguishes_harness_from_provider_metadata() -> None:
    source_info = SessionSourceInfo(harness="pi", adapter_name="pi_jsonl", record_format="jsonl")
    usage = SessionUsage(input_tokens=10, output_tokens=5, total_tokens=15)

    assert source_info.harness == "pi"
    assert not hasattr(source_info, "provider")
    assert usage.total_tokens == 15


def test_session_source_ref_can_point_to_path_line_or_uri() -> None:
    path_ref = SessionSourceRef(path=Path("session.jsonl"), line_number=4)
    uri_ref = SessionSourceRef(uri="memory://session/1")

    assert path_ref.path == Path("session.jsonl")
    assert path_ref.line_number == 4
    assert uri_ref.uri == "memory://session/1"


def test_session_query_and_result_construction() -> None:
    info = SessionSourceInfo(harness="fake", adapter_name="fake", record_format="memory")
    query = SessionQuery(repo_root=Path("/repo"), harnesses=("fake",), max_sessions=3)
    warning = SessionWarning(code="note", message="non-fatal")
    result = SessionQueryResult(source_info=info, sessions=(), warnings=(warning,))

    assert query.repo_root == Path("/repo")
    assert query.harnesses == ("fake",)
    assert result.source_info == info
    assert result.warnings == (warning,)


def test_parsed_session_uses_harness_neutral_field_names() -> None:
    session = ParsedSession(
        source_info=SessionSourceInfo(harness="pi", adapter_name="pi_jsonl", record_format="jsonl"),
        source_ref=SessionSourceRef(path=Path("session.jsonl")),
        session_id="s1",
        started_at_iso="2026-01-01T00:00:00Z",
        ended_at_iso="2026-01-01T00:01:00Z",
        association=SessionAssociation(
            repo_root=Path("/repo"),
            cwd=Path("/repo"),
            branch=None,
            confidence="repo_cwd",
            evidence=("session_header.cwd",),
        ),
        message_counts=SessionMessageCounts(user=1, assistant=1),
        model_events=(),
        tool_calls=(
            SessionToolCall(
                call_id="c1",
                tool_name="read",
                argument_keys=("path",),
                path="app.py",
            ),
        ),
        tool_results=(),
        command_executions=(),
        usage_events=(),
        warnings=(),
    )

    parsed_session_field_names = {field.name for field in fields(ParsedSession)}

    assert session.source_info.harness == "pi"
    assert session.tool_calls[0].path == "app.py"
    assert not any(name.startswith("pi_") for name in parsed_session_field_names)
