from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from twerk_core.git import real_git_gateway
from twerk_core.git.real_git_gateway import RealGitGateway, parse_name_status_output
from twerk_core.git.types import DetachedHead, GitCommandFailure, RestructuredFile


def test_get_current_branch_returns_branch_name(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert cmd == ["git", "symbolic-ref", "--short", "HEAD"]
        return subprocess.CompletedProcess(cmd, 0, stdout="feature\n", stderr="")

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().get_current_branch(Path("/repo")) == "feature"


def test_get_current_branch_returns_detached_head(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            cmd,
            128,
            stdout="",
            stderr="fatal: ref HEAD is not a symbolic ref",
        )

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().get_current_branch(Path("/repo")) == DetachedHead()


def test_get_current_branch_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            cmd,
            128,
            stdout="",
            stderr="fatal: not a git repository",
        )

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().get_current_branch(Path("/repo")) == GitCommandFailure(
        message="fatal: not a git repository",
        returncode=128,
    )


@pytest.mark.parametrize(
    ("stdout", "expected"),
    [
        ("", ()),
        (
            "R100\told.py\tnew.py\n",
            (
                RestructuredFile(
                    status="R",
                    old_path="old.py",
                    new_path="new.py",
                    similarity=100,
                ),
            ),
        ),
        (
            "C85\tsrc/a.py\tsrc/b.py\n",
            (
                RestructuredFile(
                    status="C",
                    old_path="src/a.py",
                    new_path="src/b.py",
                    similarity=85,
                ),
            ),
        ),
        (
            "R100\told path.py\tnew path.py\n",
            (
                RestructuredFile(
                    status="R",
                    old_path="old path.py",
                    new_path="new path.py",
                    similarity=100,
                ),
            ),
        ),
        (
            "M\tmodified.py\nR90\tsrc/x.py\tsrc/y.py\n",
            (
                RestructuredFile(
                    status="R",
                    old_path="src/x.py",
                    new_path="src/y.py",
                    similarity=90,
                ),
            ),
        ),
    ],
)
def test_parse_name_status_output(
    stdout: str,
    expected: tuple[RestructuredFile, ...],
) -> None:
    assert parse_name_status_output(stdout) == expected


def test_get_restructured_files_returns_parsed_files(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert cmd == [
            "git",
            "diff",
            "--name-status",
            "-M",
            "-C",
            "origin/main...HEAD",
        ]
        return subprocess.CompletedProcess(
            cmd,
            0,
            stdout="R100\tsrc/old.py\tsrc/new.py\n",
            stderr="",
        )

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().get_restructured_files(Path("/repo"), "main") == (
        RestructuredFile(
            status="R",
            old_path="src/old.py",
            new_path="src/new.py",
            similarity=100,
        ),
    )


def test_get_restructured_files_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            cmd,
            128,
            stdout="",
            stderr="fatal: bad revision 'origin/main...HEAD'",
        )

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().get_restructured_files(Path("/repo"), "main") == GitCommandFailure(
        message="Failed to detect restructured files against origin/main: "
        "fatal: bad revision 'origin/main...HEAD'",
        returncode=128,
    )
