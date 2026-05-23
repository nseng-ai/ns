from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from vibechk.errors import VibechkError
from vibechk.git import RealGitGateway


def test_real_git_gateway_rejects_non_git_workdir(tmp_path: Path) -> None:
    gateway = RealGitGateway(tmp_path)

    with pytest.raises(VibechkError, match="not a git repository"):
        gateway.repo_root()


def test_real_git_gateway_detects_dirty_repo(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path / "repo")
    gateway = RealGitGateway(repo)

    assert gateway.is_clean()
    (repo / "README.md").write_text("dirty\n", encoding="utf-8")

    assert not gateway.is_clean()


def test_real_git_gateway_rejects_detached_head(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path / "repo")
    _git(repo, "checkout", "--detach", "HEAD")
    gateway = RealGitGateway(repo)

    with pytest.raises(VibechkError, match="detached HEAD"):
        gateway.current_branch()


def test_real_git_gateway_captures_provenance(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path / "repo")
    _git(repo, "remote", "add", "origin", "git@example.com:example/repo.git")
    gateway = RealGitGateway(repo)

    assert gateway.repo_root() == repo
    assert gateway.current_branch() == "main"
    assert gateway.current_commit() == _git(repo, "rev-parse", "HEAD")
    assert gateway.remotes() == {"origin": "git@example.com:example/repo.git"}


def test_real_git_gateway_commits_changes_to_result_branch_and_restores_start(
    tmp_path: Path,
) -> None:
    repo = _init_repo(tmp_path / "repo")
    gateway = RealGitGateway(repo)
    (repo / "result.txt").write_text("agent output\n", encoding="utf-8")

    patch = gateway.diff_patch()
    gateway.create_result_branch_and_commit(
        "vibechk/aaaabbbb",
        "vibechk: capture run aaaabbbb",
    )
    gateway.checkout("main")

    assert "+agent output" in patch
    assert gateway.current_branch() == "main"
    assert gateway.is_clean()
    assert _git(repo, "show", "vibechk/aaaabbbb:result.txt") == "agent output"


def _init_repo(path: Path) -> Path:
    path.mkdir(parents=True)
    _git(path, "init", "-b", "main")
    _git(path, "config", "user.email", "vibechk@example.com")
    _git(path, "config", "user.name", "Vibechk Tests")
    (path / "README.md").write_text("initial\n", encoding="utf-8")
    _git(path, "add", "README.md")
    _git(path, "commit", "-m", "initial")
    return path


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()
