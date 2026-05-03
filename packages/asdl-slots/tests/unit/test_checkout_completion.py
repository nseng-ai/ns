from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from asdl_slots.cli.slot.checkout import _complete_branch_name


def _run_git(args: list[str], cwd: Path) -> None:
    subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=True,
    )


@pytest.fixture
def repo_with_branches(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    _run_git(["init", "-q", "-b", "main"], cwd=repo)
    _run_git(["config", "user.email", "test@example.com"], cwd=repo)
    _run_git(["config", "user.name", "Test"], cwd=repo)
    _run_git(["commit", "--allow-empty", "-m", "init"], cwd=repo)
    _run_git(["branch", "feature/foo"], cwd=repo)
    _run_git(["branch", "feature/bar"], cwd=repo)
    return repo


def test_complete_branch_name_filters_by_prefix(
    repo_with_branches: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(repo_with_branches)

    result = _complete_branch_name(ctx=None, param=None, incomplete="feat")  # type: ignore[arg-type]

    assert set(result) == {"feature/foo", "feature/bar"}


def test_complete_branch_name_empty_incomplete_returns_all(
    repo_with_branches: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(repo_with_branches)

    result = _complete_branch_name(ctx=None, param=None, incomplete="")  # type: ignore[arg-type]

    assert set(result) == {"main", "feature/foo", "feature/bar"}


def test_complete_branch_name_outside_repo_returns_empty(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    not_a_repo = tmp_path / "not-a-repo"
    not_a_repo.mkdir()
    monkeypatch.chdir(not_a_repo)

    result = _complete_branch_name(ctx=None, param=None, incomplete="")  # type: ignore[arg-type]

    assert result == []
