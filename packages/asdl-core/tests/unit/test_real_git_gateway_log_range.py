"""Unit tests for ``RealGitGateway.log_range``."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from asdl_core.git import real_git_gateway
from asdl_core.git.real_git_gateway import RealGitGateway
from asdl_core.git.types import CommitSummary, GitCommandFailure


def test_log_range_returns_commits(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        captured["cmd"] = cmd
        captured["cwd"] = kwargs.get("cwd")
        return subprocess.CompletedProcess(
            cmd,
            0,
            stdout="sha-1\x002026-04-26T18:00:00+00:00\x00First\n",
            stderr="",
        )

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    gateway = RealGitGateway(repo_root=Path("/repo"))
    result = gateway.log_range("master..HEAD")

    assert result == (
        CommitSummary(sha="sha-1", author_iso="2026-04-26T18:00:00+00:00", subject="First"),
    )
    assert captured["cmd"] == ["git", "log", "--format=%H%x00%aI%x00%s", "master..HEAD"]
    assert captured["cwd"] == Path("/repo")


def test_log_range_returns_failure_on_nonzero_exit(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            cmd,
            128,
            stdout="",
            stderr="fatal: bad revision 'master..HEAD'\n",
        )

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    gateway = RealGitGateway(repo_root=Path("/repo"))
    result = gateway.log_range("master..HEAD")

    assert result == GitCommandFailure(
        message="fatal: bad revision 'master..HEAD'",
        returncode=128,
    )


def test_log_range_failure_uses_default_message_when_stderr_blank(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="")

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    gateway = RealGitGateway(repo_root=Path("/repo"))
    result = gateway.log_range("foo..bar")

    assert result == GitCommandFailure(message="git log failed", returncode=1)


def test_log_range_returns_empty_tuple_when_no_commits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    gateway = RealGitGateway(repo_root=Path("/repo"))
    result = gateway.log_range("master..HEAD")

    assert result == ()
