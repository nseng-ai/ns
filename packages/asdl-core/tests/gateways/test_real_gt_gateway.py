from __future__ import annotations

import json
import sqlite3
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pytest

from asdl_core.gt.real_gateway import RealGtGateway
from asdl_core.gt.types import GtCommandFailure, StackInfo


@dataclass(frozen=True)
class _BranchRow:
    branch_name: str
    parent_branch_name: str | None
    children: tuple[str, ...] = ()
    validation_result: str | None = None


def _build_metadata_db(tmp_path: Path, branches: list[_BranchRow]) -> Path:
    db_path = tmp_path / ".graphite_metadata.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE branch_metadata (
                branch_name TEXT PRIMARY KEY,
                parent_branch_name TEXT,
                children TEXT NOT NULL,
                validation_result TEXT,
                extra_graphite_column TEXT
            )
            """
        )
        connection.executemany(
            """
            INSERT INTO branch_metadata (
                branch_name,
                parent_branch_name,
                children,
                validation_result,
                extra_graphite_column
            ) VALUES (?, ?, ?, ?, ?)
            """,
            [
                (
                    branch.branch_name,
                    branch.parent_branch_name,
                    json.dumps(list(branch.children)),
                    branch.validation_result,
                    None,
                )
                for branch in branches
            ],
        )
    return db_path


def _patch_git_rev_parse(
    monkeypatch: pytest.MonkeyPatch,
    *,
    common_dir: Path | None,
    current_branch: str | None = "feat/current",
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd == ["git", "rev-parse", "--git-common-dir"]:
            if common_dir is None:
                return subprocess.CompletedProcess(
                    cmd,
                    128,
                    stdout="",
                    stderr="fatal: not a git repository",
                )
            return subprocess.CompletedProcess(cmd, 0, stdout=f"{common_dir}\n", stderr="")
        if cmd == ["git", "rev-parse", "--abbrev-ref", "HEAD"]:
            if current_branch is None:
                return subprocess.CompletedProcess(
                    cmd,
                    128,
                    stdout="",
                    stderr="fatal: ambiguous argument HEAD",
                )
            return subprocess.CompletedProcess(cmd, 0, stdout=f"{current_branch}\n", stderr="")
        raise AssertionError(f"unexpected subprocess invocation: {cmd!r}")

    monkeypatch.setattr("asdl_core.gt.real_gateway.subprocess.run", fake_run)


def test_real_gt_gateway_missing_gt_returns_command_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        raise FileNotFoundError("gt: not found")

    monkeypatch.setattr("asdl_core.gt.real_gateway.subprocess.run", fake_run)

    result = RealGtGateway().trunk(Path("/repo"))

    assert isinstance(result, GtCommandFailure)
    assert result.returncode == 127
    assert "gt: not found" in result.message


def test_real_gt_gateway_stack_reads_metadata_after_git_resolution(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/mid",), "TRUNK"),
            _BranchRow("feat/mid", "main", ("feat/current",)),
            _BranchRow("feat/current", "feat/mid"),
        ],
    )
    _patch_git_rev_parse(monkeypatch, common_dir=tmp_path, current_branch="feat/current")

    result = RealGtGateway().stack(tmp_path)

    assert result == StackInfo(
        trunk="main",
        current="feat/current",
        ancestors=("main", "feat/mid"),
        children=(),
        warnings=(),
        descendants=(),
    )


def test_real_gt_gateway_stack_returns_failure_for_missing_metadata_db(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_git_rev_parse(monkeypatch, common_dir=tmp_path, current_branch="feat/current")

    result = RealGtGateway().stack(tmp_path)

    assert isinstance(result, GtCommandFailure)
    assert result.returncode is None
    assert "not found" in result.message
    assert str(tmp_path / ".graphite_metadata.db") in result.message


def test_real_gt_gateway_stack_returns_failure_when_common_dir_resolution_fails(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_git_rev_parse(monkeypatch, common_dir=None, current_branch="feat/current")

    result = RealGtGateway().stack(tmp_path)

    assert isinstance(result, GtCommandFailure)
    assert result.returncode is None
    assert "git common dir" in result.message


def test_real_gt_gateway_stack_returns_failure_when_current_branch_resolution_fails(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_git_rev_parse(monkeypatch, common_dir=tmp_path, current_branch=None)

    result = RealGtGateway().stack(tmp_path)

    assert isinstance(result, GtCommandFailure)
    assert result.returncode is None
    assert "current branch" in result.message
