from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from twerk_core.brmem.gateway import InvalidBranchNameError
from twerk_core.brmem.real import RealBranchMemoryGateway


def _run_git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=True,
    )


def _init_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    _run_git(repo, "init")
    _run_git(repo, "config", "user.name", "Twerk Tests")
    _run_git(repo, "config", "user.email", "twerk@example.com")
    (repo / "README.md").write_text("hello\n", encoding="utf-8")
    _run_git(repo, "add", "README.md")
    _run_git(repo, "commit", "-m", "initial")
    return repo


def test_real_brmem_round_trip_uses_flat_ref_names_and_preserves_history(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)
    head_before = _run_git(repo, "rev-parse", "HEAD").stdout.strip()
    status_before = _run_git(repo, "status", "--porcelain").stdout

    first_commit = gateway.put("feat/x", "docs/notes.md", "one\n")
    second_commit = gateway.put("feat/x", "docs/notes.md", "two\n")

    encoded_ref = "refs/brmem/feat---x"
    assert _run_git(repo, "rev-parse", encoded_ref).stdout.strip() == second_commit
    assert gateway.get("feat/x", "docs/notes.md") == "two\n"
    assert gateway.get("feat/x", "docs/notes.md", at=first_commit) == "one\n"

    head_after = _run_git(repo, "rev-parse", "HEAD").stdout.strip()
    status_after = _run_git(repo, "status", "--porcelain").stdout
    assert head_after == head_before
    assert status_after == status_before == ""


def test_real_brmem_rejects_branch_names_containing_encoding_separator(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    with pytest.raises(InvalidBranchNameError):
        gateway.put("feat---x", "notes.md", "hello\n")
