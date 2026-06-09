from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from asdl_core.git import construction
from asdl_core.git.construction import GitContext, GitUnavailable
from asdl_core.git.real_git_gateway import RealGitGateway


def _completed(
    cmd: list[str], returncode: int, stdout: str = ""
) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(cmd, returncode, stdout=stdout, stderr="")


def test_build_git_gateway_returns_real_git_gateway() -> None:
    gateway = construction.build_git_gateway(repo_root=Path("/repo"), trunk_branch="main")

    assert isinstance(gateway, RealGitGateway)
    assert gateway.get_trunk_branch() == "main"


def test_build_git_gateway_is_lazy(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        raise AssertionError("build_git_gateway should not run subprocesses")

    monkeypatch.setattr(construction.subprocess, "run", fail_run)

    gateway = construction.build_git_gateway()

    assert isinstance(gateway, RealGitGateway)


def test_resolve_repo_root_returns_path(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert cmd == ["git", "rev-parse", "--show-toplevel"]
        return _completed(cmd, 0, "/repo\n")

    monkeypatch.setattr(construction.subprocess, "run", fake_run)

    assert construction.resolve_repo_root(Path("/repo/subdir")) == Path("/repo")


def test_resolve_repo_root_returns_none_outside_repo(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return _completed(cmd, 128, "")

    monkeypatch.setattr(construction.subprocess, "run", fake_run)

    assert construction.resolve_repo_root(Path("/tmp")) is None


def test_build_git_context_returns_unavailable_outside_repo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return _completed(cmd, 128, "")

    monkeypatch.setattr(construction.subprocess, "run", fake_run)

    result = construction.build_git_context(Path("/tmp"))

    assert result == GitUnavailable(
        reason="not_in_git_repo",
        message="Not inside a git repository.",
    )


def test_build_git_context_returns_unavailable_when_git_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        raise FileNotFoundError("git")

    monkeypatch.setattr(construction.subprocess, "run", fake_run)

    result = construction.build_git_context(Path("/tmp"))

    assert result == GitUnavailable(
        reason="git_unavailable",
        message="`git` binary not found on PATH.",
    )


def test_build_git_context_returns_context_with_resolved_trunk(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd == ["git", "rev-parse", "--show-toplevel"]:
            return _completed(cmd, 0, "/repo\n")
        if cmd == ["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"]:
            return _completed(cmd, 0, "origin/main\n")
        if cmd == ["git", "show-ref", "--verify", "--quiet", "refs/heads/main"]:
            return _completed(cmd, 0)
        raise AssertionError(f"unexpected command: {cmd}")

    monkeypatch.setattr(construction.subprocess, "run", fake_run)

    result = construction.build_git_context(Path("/repo/subdir"))

    assert isinstance(result, GitContext)
    assert result.repo_root == Path("/repo")
    assert result.trunk_branch == "main"
    assert isinstance(result.git, RealGitGateway)
    assert result.git.get_trunk_branch() == "main"


def test_build_git_context_succeeds_without_resolved_trunk(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd == ["git", "rev-parse", "--show-toplevel"]:
            return _completed(cmd, 0, "/repo\n")
        return _completed(cmd, 1)

    monkeypatch.setattr(construction.subprocess, "run", fake_run)

    result = construction.build_git_context(Path("/repo"))

    assert isinstance(result, GitContext)
    assert result.repo_root == Path("/repo")
    assert result.trunk_branch is None


def test_resolve_trunk_branch_prefers_origin_head_local_branch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd == ["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"]:
            return _completed(cmd, 0, "origin/develop\n")
        if cmd == ["git", "show-ref", "--verify", "--quiet", "refs/heads/develop"]:
            return _completed(cmd, 0)
        raise AssertionError(f"unexpected command: {cmd}")

    monkeypatch.setattr(construction.subprocess, "run", fake_run)

    assert construction.resolve_trunk_branch(Path("/repo")) == "develop"


def test_resolve_trunk_branch_falls_back_to_main_then_master(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd == ["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"]:
            return _completed(cmd, 1)
        if cmd == ["git", "show-ref", "--verify", "--quiet", "refs/heads/main"]:
            return _completed(cmd, 1)
        if cmd == ["git", "show-ref", "--verify", "--quiet", "refs/heads/master"]:
            return _completed(cmd, 0)
        raise AssertionError(f"unexpected command: {cmd}")

    monkeypatch.setattr(construction.subprocess, "run", fake_run)

    assert construction.resolve_trunk_branch(Path("/repo")) == "master"


def test_resolve_trunk_branch_returns_none_when_unresolved(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return _completed(cmd, 1)

    monkeypatch.setattr(construction.subprocess, "run", fake_run)

    assert construction.resolve_trunk_branch(Path("/repo")) is None
