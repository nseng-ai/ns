"""Integration tests for Pi JSONL session filesystem discovery."""

from __future__ import annotations

import json
from pathlib import Path

from asdl_core.sessions.adapters.pi_jsonl import PiJsonlSessionSource, encode_pi_session_dir_name
from asdl_core.sessions.types import SessionQuery, SessionSourceRef


def test_pi_source_warns_when_session_root_is_missing(tmp_path: Path) -> None:
    missing_root = tmp_path / "sessions"

    result = PiJsonlSessionSource().query(
        SessionQuery(repo_root=Path("/repo"), session_root=missing_root)
    )

    assert result.sessions == ()
    assert [warning.code for warning in result.warnings] == ["session_root_missing"]
    assert result.warnings[0].source_ref == SessionSourceRef(path=missing_root)


def test_pi_source_warns_when_repo_session_directory_is_missing(tmp_path: Path) -> None:
    session_root = tmp_path / "sessions"
    session_root.mkdir()

    result = PiJsonlSessionSource().query(
        SessionQuery(repo_root=Path("/repo"), session_root=session_root)
    )

    assert result.sessions == ()
    assert [warning.code for warning in result.warnings] == ["repo_session_dir_missing"]


def test_pi_source_discovers_repo_session_files_newest_first(tmp_path: Path) -> None:
    repo_root = Path("/repo")
    session_root = tmp_path / "sessions"
    repo_dir = session_root / encode_pi_session_dir_name(repo_root)
    repo_dir.mkdir(parents=True)
    _write_minimal_session(repo_dir / "2026-01-02T00-00-00Z_b.jsonl", "new")
    _write_minimal_session(repo_dir / "2026-01-01T00-00-00Z_a.jsonl", "old")

    result = PiJsonlSessionSource().query(
        SessionQuery(repo_root=repo_root, session_root=session_root, max_sessions=1)
    )

    assert result.source_info.harness == "pi"
    assert [session.session_id for session in result.sessions] == ["new"]
    assert result.sessions[0].source_ref.path == repo_dir / "2026-01-02T00-00-00Z_b.jsonl"


def test_pi_source_flattens_parser_warnings(tmp_path: Path) -> None:
    repo_root = Path("/repo")
    session_root = tmp_path / "sessions"
    repo_dir = session_root / encode_pi_session_dir_name(repo_root)
    repo_dir.mkdir(parents=True)
    path = repo_dir / "2026-01-01T00-00-00Z.jsonl"
    path.write_text('{"type":"session","id":"s1"}\n{bad json}\n', encoding="utf-8")

    result = PiJsonlSessionSource().query(
        SessionQuery(repo_root=repo_root, session_root=session_root)
    )

    assert len(result.sessions) == 1
    assert [warning.code for warning in result.warnings] == ["malformed_json"]
    assert result.warnings[0].source_ref == SessionSourceRef(path=path, line_number=2)


def test_pi_source_applies_iso_time_filters(tmp_path: Path) -> None:
    repo_root = Path("/repo")
    session_root = tmp_path / "sessions"
    repo_dir = session_root / encode_pi_session_dir_name(repo_root)
    repo_dir.mkdir(parents=True)
    _write_minimal_session(
        repo_dir / "2026-01-03T00-00-00Z_new.jsonl",
        "new",
        timestamp="2026-01-03T00:00:00Z",
    )
    _write_minimal_session(
        repo_dir / "2026-01-01T00-00-00Z_old.jsonl",
        "old",
        timestamp="2026-01-01T00:00:00Z",
    )

    result = PiJsonlSessionSource().query(
        SessionQuery(
            repo_root=repo_root,
            session_root=session_root,
            since_iso="2026-01-02T00:00:00Z",
            until_iso="2026-01-04T00:00:00Z",
        )
    )

    assert [session.session_id for session in result.sessions] == ["new"]


def _write_minimal_session(
    path: Path,
    session_id: str,
    *,
    timestamp: str = "2026-01-01T00:00:00Z",
) -> None:
    path.write_text(
        json.dumps(
            {
                "type": "session",
                "id": session_id,
                "timestamp": timestamp,
                "cwd": "/repo",
            }
        ),
        encoding="utf-8",
    )
