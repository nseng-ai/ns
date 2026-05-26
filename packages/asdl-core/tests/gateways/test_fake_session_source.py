"""Tests for the in-memory session source fake."""

from __future__ import annotations

from pathlib import Path

from asdl_core.sessions.testing import FakeSessionSource
from asdl_core.sessions.types import (
    ParsedSession,
    SessionAssociation,
    SessionMessageCounts,
    SessionQuery,
    SessionSourceInfo,
    SessionSourceRef,
    SessionWarning,
)


def test_fake_session_source_defaults_to_empty_memory_source() -> None:
    source = FakeSessionSource()
    query = SessionQuery(repo_root=Path("/repo"))

    result = source.query(query)

    assert source.source_info == SessionSourceInfo(
        harness="fake",
        adapter_name="fake",
        record_format="memory",
    )
    assert result.sessions == ()
    assert result.warnings == ()
    assert source.queries == (query,)


def test_fake_session_source_returns_seeded_sessions_and_warnings() -> None:
    info = SessionSourceInfo(harness="codex-cli", adapter_name="fake_codex", record_format="memory")
    session = _parsed_session(info, session_id="s1")
    warning = SessionWarning(code="note", message="seeded")
    source = FakeSessionSource(source_info=info, sessions=(session,), warnings=(warning,))

    result = source.query(SessionQuery(repo_root=Path("/repo")))

    assert result.source_info == info
    assert result.sessions == (session,)
    assert result.warnings == (warning,)


def test_fake_session_source_query_tracking_is_public_tuple_snapshot() -> None:
    source = FakeSessionSource()
    first = SessionQuery(repo_root=Path("/repo/a"))
    second = SessionQuery(repo_root=Path("/repo/b"))

    source.query(first)
    snapshot = source.queries
    source.query(second)

    assert snapshot == (first,)
    assert source.queries == (first, second)


def _parsed_session(info: SessionSourceInfo, *, session_id: str) -> ParsedSession:
    return ParsedSession(
        source_info=info,
        source_ref=SessionSourceRef(uri=f"memory://{session_id}"),
        session_id=session_id,
        started_at_iso=None,
        ended_at_iso=None,
        association=SessionAssociation(
            repo_root=Path("/repo"),
            cwd=Path("/repo"),
            branch=None,
            confidence="repo_cwd",
            evidence=("test",),
        ),
        message_counts=SessionMessageCounts(),
        model_events=(),
        tool_calls=(),
        tool_results=(),
        command_executions=(),
        usage_events=(),
        warnings=(),
    )
