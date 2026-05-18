"""Tests for Pi JSONL source path helpers."""

from __future__ import annotations

from pathlib import Path

from asdl_core.sessions.adapters.pi_jsonl import (
    PiJsonlSessionSource,
    default_pi_session_root,
    encode_pi_session_dir_name,
)
from asdl_core.sessions.types import SessionQuery


def test_encode_pi_session_dir_name_uses_observed_separator_convention() -> None:
    assert encode_pi_session_dir_name(Path("/Users/schrockn/code/asdl-tools")) == (
        "--Users-schrockn-code-asdl-tools--"
    )


def test_default_pi_session_root_defers_to_home_directory() -> None:
    assert default_pi_session_root() == Path.home() / ".pi" / "agent" / "sessions"


def test_pi_source_harness_filter_excludes_pi_without_filesystem_warning(tmp_path: Path) -> None:
    missing_root = tmp_path / "missing"

    result = PiJsonlSessionSource().query(
        SessionQuery(
            repo_root=Path("/repo"),
            session_root=missing_root,
            harnesses=("claude-code",),
        )
    )

    assert result.sessions == ()
    assert result.warnings == ()
