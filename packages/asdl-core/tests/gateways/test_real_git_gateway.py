from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from asdl_core.git import real_git_gateway
from asdl_core.git.real_git_gateway import (
    RealGitGateway,
    parse_git_path_change_output,
    parse_name_status_output,
    parse_untracked_files_output,
)
from asdl_core.git.types import DetachedHead, GitCommandFailure, GitPathChange, RestructuredFile


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


@pytest.mark.parametrize(
    ("stdout", "expected"),
    [
        ("", ()),
        (
            "M\x00src/app.py\x00A\x00src/new.py\x00",
            (
                GitPathChange(status="M", path="src/app.py"),
                GitPathChange(status="A", path="src/new.py"),
            ),
        ),
        (
            "R100\x00src/old.py\x00src/new.py\x00C80\x00src/a.py\x00src/b.py\x00",
            (
                GitPathChange(status="R100", path="src/new.py", old_path="src/old.py"),
                GitPathChange(status="C80", path="src/b.py", old_path="src/a.py"),
            ),
        ),
        ("M\x00", ()),
        ("R100\x00old-only\x00", ()),
    ],
)
def test_parse_git_path_change_output(
    stdout: str,
    expected: tuple[GitPathChange, ...],
) -> None:
    assert parse_git_path_change_output(stdout) == expected


def test_parse_untracked_files_output() -> None:
    assert parse_untracked_files_output("scratch.txt\x00notes.md\x00") == (
        GitPathChange(status="??", path="scratch.txt"),
        GitPathChange(status="??", path="notes.md"),
    )


def test_list_working_tree_changes_returns_diff_and_untracked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[list[str], Path | None]] = []

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append((cmd, kwargs.get("cwd") if isinstance(kwargs.get("cwd"), Path) else None))
        if cmd == ["git", "diff", "--name-status", "-z", "-M", "-C"]:
            return subprocess.CompletedProcess(
                cmd,
                0,
                stdout="M\x00src/app.py\x00R100\x00old.py\x00new.py\x00",
                stderr="",
            )
        if cmd == ["git", "ls-files", "--others", "--exclude-standard", "-z"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="scratch.txt\x00", stderr="")
        raise AssertionError(f"unexpected command: {cmd!r}")

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().list_working_tree_changes(Path("/repo")) == (
        GitPathChange(status="M", path="src/app.py"),
        GitPathChange(status="R100", path="new.py", old_path="old.py"),
        GitPathChange(status="??", path="scratch.txt"),
    )
    assert calls == [
        (["git", "diff", "--name-status", "-z", "-M", "-C"], Path("/repo")),
        (["git", "ls-files", "--others", "--exclude-standard", "-z"], Path("/repo")),
    ]


def test_list_working_tree_changes_returns_diff_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 128, stdout="", stderr="fatal: not a repo")

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().list_working_tree_changes(Path("/repo")) == GitCommandFailure(
        message="Failed to list working tree changes: fatal: not a repo",
        returncode=128,
    )


def test_list_index_changes_uses_cached_diff(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        captured["cmd"] = cmd
        captured["cwd"] = kwargs.get("cwd")
        return subprocess.CompletedProcess(cmd, 0, stdout="A\x00staged.py\x00", stderr="")

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().list_index_changes(Path("/repo")) == (
        GitPathChange(status="A", path="staged.py"),
    )
    assert captured == {
        "cmd": ["git", "diff", "--cached", "--name-status", "-z", "-M", "-C"],
        "cwd": Path("/repo"),
    }


def test_list_range_changes_uses_base_ref(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        captured["cmd"] = cmd
        captured["cwd"] = kwargs.get("cwd")
        return subprocess.CompletedProcess(cmd, 0, stdout="D\x00deleted.py\x00", stderr="")

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().list_range_changes(Path("/repo"), "main") == (
        GitPathChange(status="D", path="deleted.py"),
    )
    assert captured == {
        "cmd": ["git", "diff", "--name-status", "-z", "-M", "-C", "main...HEAD"],
        "cwd": Path("/repo"),
    }
