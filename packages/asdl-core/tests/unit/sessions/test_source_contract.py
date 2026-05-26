"""Tests for the shared session source contract."""

from __future__ import annotations

from pathlib import Path

from asdl_core.sessions.adapters.pi_jsonl import PiJsonlSessionSource
from asdl_core.sessions.source import SessionSource
from asdl_core.sessions.testing import FakeSessionSource
from asdl_core.sessions.types import SessionQuery, SessionSourceInfo


def test_fake_source_satisfies_session_source_contract() -> None:
    source: SessionSource = FakeSessionSource()

    result = source.query(SessionQuery(repo_root=Path("/repo")))

    assert source.source_info == SessionSourceInfo(
        harness="fake",
        adapter_name="fake",
        record_format="memory",
    )
    assert result.sessions == ()


def test_pi_source_exposes_identity_without_querying_filesystem() -> None:
    source: SessionSource = PiJsonlSessionSource()

    assert source.source_info == SessionSourceInfo(
        harness="pi",
        adapter_name="pi_jsonl",
        record_format="jsonl",
    )
