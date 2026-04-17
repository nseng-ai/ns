from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from twerk_reviewer import git_toplevel as git_toplevel_module
from twerk_reviewer.git_toplevel import git_toplevel, run_git
from twerk_reviewer.models import ReviewerFailure


def test_run_git_returns_completed_process(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert cmd == ["git", "status"]
        assert kwargs["cwd"] == Path("/repo")
        return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

    monkeypatch.setattr(git_toplevel_module.subprocess, "run", fake_run)

    result = run_git(["git", "status"], cwd=Path("/repo"))

    assert isinstance(result, subprocess.CompletedProcess)
    assert result.stdout == "ok"


def test_run_git_returns_failure_on_oserror(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        raise OSError("binary missing")

    monkeypatch.setattr(git_toplevel_module.subprocess, "run", fake_run)

    result = run_git(["git", "status"], cwd=Path("/repo"))

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "git_invocation_failed"
    assert "binary missing" in result.message


def test_git_toplevel_returns_path(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert cmd == ["git", "rev-parse", "--show-toplevel"]
        return subprocess.CompletedProcess(cmd, 0, stdout="/repo/root\n", stderr="")

    monkeypatch.setattr(git_toplevel_module.subprocess, "run", fake_run)

    assert git_toplevel(cwd=Path("/anywhere")) == Path("/repo/root")


def test_git_toplevel_returns_failure_on_non_zero_exit(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 128, stdout="", stderr="fatal: not a git repo")

    monkeypatch.setattr(git_toplevel_module.subprocess, "run", fake_run)

    result = git_toplevel(cwd=Path("/not-a-repo"))

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "repo_root_unavailable"
    assert "not a git repo" in result.message
