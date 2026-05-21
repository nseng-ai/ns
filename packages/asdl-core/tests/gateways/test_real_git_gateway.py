from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from asdl_core.git import real_git_gateway
from asdl_core.git.real_git_gateway import (
    RealGitGateway,
    parse_local_branch_tip_output,
    parse_name_status_output,
)
from asdl_core.git.types import DetachedHead, GitCommandFailure, LocalBranchTip, RestructuredFile


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


def test_parse_local_branch_tip_output_parses_nul_delimited_lines() -> None:
    assert parse_local_branch_tip_output(
        "main\x002026-05-20T10:44:08-04:00\n"
        "feat/x\x002026-05-20T11:15:42-04:00\n"
        "missing-separator\n"
        "empty-time\x00\n"
    ) == (
        LocalBranchTip(name="main", head_iso="2026-05-20T10:44:08-04:00"),
        LocalBranchTip(name="feat/x", head_iso="2026-05-20T11:15:42-04:00"),
        LocalBranchTip(name="empty-time", head_iso=None),
    )


def test_list_local_branch_tips_returns_branch_names_and_timestamps(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    (repo / "README.md").write_text("hello\n", encoding="utf-8")
    _git(repo, "add", "README.md")
    _git(repo, "commit", "-m", "initial")
    _git(repo, "branch", "-M", "main")
    _git(repo, "branch", "feat/x")

    result = RealGitGateway(repo_root=repo).list_local_branch_tips()

    assert tuple(tip.name for tip in result) == ("feat/x", "main")
    assert all(tip.head_iso is not None for tip in result)
    assert all("T" in tip.head_iso for tip in result if tip.head_iso is not None)


def test_list_tracked_paths_at_ref_returns_recursive_paths(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    root = repo / ".asdl" / "objectives"
    (root / "alpha" / "updates").mkdir(parents=True)
    (root / "beta").mkdir()
    (root / "alpha" / "objective.md").write_text("# Alpha\n", encoding="utf-8")
    (root / "alpha" / "updates" / "progress.md").write_text("# Progress\n", encoding="utf-8")
    (root / "beta" / "closed.md").write_text("closed\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "objectives")

    result = RealGitGateway(repo_root=repo).list_tracked_paths_at_ref("HEAD", ".asdl/objectives")

    assert result == (
        ".asdl/objectives/alpha/objective.md",
        ".asdl/objectives/alpha/updates/progress.md",
        ".asdl/objectives/beta/closed.md",
    )


def test_list_tracked_paths_at_ref_missing_tree_path_returns_empty(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    (repo / "README.md").write_text("hello\n", encoding="utf-8")
    _git(repo, "add", "README.md")
    _git(repo, "commit", "-m", "initial")

    result = RealGitGateway(repo_root=repo).list_tracked_paths_at_ref("HEAD", ".asdl/objectives")

    assert result == ()


def test_list_tracked_paths_at_ref_invalid_ref_returns_failure(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)

    result = RealGitGateway(repo_root=repo).list_tracked_paths_at_ref(
        "refs/heads/does-not-exist",
        ".asdl/objectives",
    )

    assert isinstance(result, GitCommandFailure)
    assert result.returncode != 0


def test_list_directories_at_ref_missing_tree_path_returns_empty(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    (repo / "README.md").write_text("hello\n", encoding="utf-8")
    _git(repo, "add", "README.md")
    _git(repo, "commit", "-m", "initial")

    result = RealGitGateway(repo_root=repo).list_directories_at_ref("HEAD", ".asdl/objectives")

    assert result == ()


def test_list_directories_at_ref_returns_direct_child_directories(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    root = repo / ".asdl" / "objectives"
    (root / "beta").mkdir(parents=True)
    (root / "alpha").mkdir()
    (root / "root-note.md").write_text("not a directory\n", encoding="utf-8")
    (root / "alpha" / "objective.md").write_text("# Alpha\n", encoding="utf-8")
    (root / "beta" / "objective.md").write_text("# Beta\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "objectives")

    result = RealGitGateway(repo_root=repo).list_directories_at_ref("HEAD", ".asdl/objectives")

    assert result == ("alpha", "beta")


def test_path_exists_at_ref_reports_file_existence(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    record = repo / ".asdl" / "objectives" / "alpha"
    record.mkdir(parents=True)
    (record / "objective.md").write_text("# Alpha\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "objective")
    gateway = RealGitGateway(repo_root=repo)

    assert gateway.path_exists_at_ref("HEAD", ".asdl/objectives/alpha/objective.md")
    assert not gateway.path_exists_at_ref("HEAD", ".asdl/objectives/alpha/closed.md")


def _init_git_repo(path: Path) -> Path:
    _git(path, "init")
    _git(path, "config", "user.email", "test@example.com")
    _git(path, "config", "user.name", "Test User")
    return path


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    )
