"""Integration tests for RealWorkingMemoryGateway."""

from __future__ import annotations

import subprocess
from pathlib import Path

from twerk_core.working_memory.real import RealWorkingMemoryGateway


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
    (repo / "README.md").write_text("hello\n")
    _run_git(repo, "add", "README.md")
    _run_git(repo, "commit", "-m", "initial")
    return repo


def test_real_working_memory_write_creates_ref_and_read_returns_content(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealWorkingMemoryGateway(cwd=repo)

    assert gateway.exists("feat/x") is False

    gateway.write("feat/x", {"plan.md": "# Plan\n"})

    assert gateway.exists("feat/x") is True
    assert gateway.read("feat/x", "plan.md") == "# Plan\n"


def test_real_working_memory_write_preserves_existing_files_across_calls(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealWorkingMemoryGateway(cwd=repo)

    gateway.write("feat/x", {"plan.md": "# Plan\n"})
    gateway.write("feat/x", {"notes.md": "notes\n"})

    assert gateway.read("feat/x", "plan.md") == "# Plan\n"
    assert gateway.read("feat/x", "notes.md") == "notes\n"


def test_real_working_memory_read_missing_returns_none(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealWorkingMemoryGateway(cwd=repo)

    assert gateway.read("feat/x", "plan.md") is None

    gateway.write("feat/x", {"plan.md": "# Plan\n"})

    assert gateway.read("feat/x", "missing.md") is None


def test_real_working_memory_second_write_chains_commits(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealWorkingMemoryGateway(cwd=repo)

    gateway.write("feat/x", {"plan.md": "# Plan\n"})
    gateway.write("feat/x", {"notes.md": "notes\n"})

    log = _run_git(repo, "log", "--format=%s", "refs/working-memory/branches/feat/x")

    assert log.stdout.splitlines() == ["working memory update", "working memory init"]


def test_real_working_memory_keeps_head_and_worktree_unchanged(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealWorkingMemoryGateway(cwd=repo)
    head_before = _run_git(repo, "rev-parse", "HEAD").stdout.strip()
    status_before = _run_git(repo, "status", "--porcelain").stdout

    gateway.write("feat/x", {"plan.md": "# Plan\n"})

    head_after = _run_git(repo, "rev-parse", "HEAD").stdout.strip()
    status_after = _run_git(repo, "status", "--porcelain").stdout

    assert head_after == head_before
    assert status_after == status_before == ""
