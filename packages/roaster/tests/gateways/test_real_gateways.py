from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from roaster.gateways.local_diff import real as local_diff_real
from roaster.gateways.local_diff.real import RealLocalDiffGateway
from roaster.gateways.review_catalog import real as review_catalog_real
from roaster.gateways.review_catalog.real import RealReviewCatalogGateway
from roaster.models import LocalDiff, ReviewSource


def test_real_review_catalog_loads_review_source(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reviews_dir = tmp_path / "reviews"
    path = reviews_dir / "dignified-python.md"
    path.parent.mkdir(parents=True)
    path.write_text("# Dignified Python", encoding="utf-8")

    def fake_git_toplevel(*, cwd: Path) -> Path:
        return tmp_path

    monkeypatch.setattr(review_catalog_real, "git_toplevel", fake_git_toplevel)

    result = RealReviewCatalogGateway(cwd=tmp_path).load_review_source(key="dignified-python")

    assert isinstance(result, ReviewSource)
    assert result.key == "dignified-python"
    assert result.path == path
    assert result.source == "# Dignified Python"


def test_real_local_diff_runs_git_diff(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cwd = Path("/repo")
    captured_cmds: list[list[str]] = []

    def fake_git_toplevel(*, cwd: Path) -> Path:
        return cwd

    def fake_run_git(cmd: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
        captured_cmds.append(cmd)
        assert cwd == Path("/repo")
        if cmd == ["git", "diff", "--no-ext-diff", "origin/master...HEAD"]:
            return subprocess.CompletedProcess(
                cmd,
                0,
                stdout="diff --git a/app.py b/app.py\n+print('hello')\n",
                stderr="",
            )
        if cmd == ["git", "diff", "--no-ext-diff", "--name-only", "origin/master...HEAD"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="app.py\n", stderr="")
        raise AssertionError(f"unexpected command: {cmd!r}")

    monkeypatch.setattr(local_diff_real, "git_toplevel", fake_git_toplevel)
    monkeypatch.setattr(local_diff_real, "run_git", fake_run_git)

    result = RealLocalDiffGateway(cwd=cwd).load_diff(base_ref="master")

    assert isinstance(result, LocalDiff)
    assert result.base_ref == "master"
    assert "diff --git a/app.py b/app.py" in result.diff_text
    assert result.changed_paths == ("app.py",)
    assert captured_cmds == [
        ["git", "diff", "--no-ext-diff", "origin/master...HEAD"],
        ["git", "diff", "--no-ext-diff", "--name-only", "origin/master...HEAD"],
    ]


def test_real_local_diff_excludes_vendored_skill_python_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agents_skills_dir = tmp_path / ".agents" / "skills"
    agents_skills_dir.mkdir(parents=True)
    (agents_skills_dir / "vendored-skill").mkdir()

    first_party_skill_dir = tmp_path / "skills" / "first-party"
    first_party_skill_dir.mkdir(parents=True)
    (agents_skills_dir / "first-party").symlink_to(
        Path("../../skills/first-party"),
        target_is_directory=True,
    )

    claude_skills_dir = tmp_path / ".claude" / "skills"
    claude_skills_dir.mkdir(parents=True)
    (claude_skills_dir / "vendored-skill").symlink_to(
        Path("../../.agents/skills/vendored-skill"),
        target_is_directory=True,
    )
    captured_cmds: list[list[str]] = []

    def fake_git_toplevel(*, cwd: Path) -> Path:
        return cwd

    def fake_run_git(cmd: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
        captured_cmds.append(cmd)
        assert cwd == tmp_path
        if "--name-only" in cmd:
            return subprocess.CompletedProcess(cmd, 0, stdout="app.py\n", stderr="")
        return subprocess.CompletedProcess(
            cmd,
            0,
            stdout="diff --git a/app.py b/app.py\n+print('hello')\n",
            stderr="",
        )

    monkeypatch.setattr(local_diff_real, "git_toplevel", fake_git_toplevel)
    monkeypatch.setattr(local_diff_real, "run_git", fake_run_git)

    result = RealLocalDiffGateway(cwd=tmp_path).load_diff(base_ref="main")

    assert isinstance(result, LocalDiff)
    assert result.changed_paths == ("app.py",)
    assert captured_cmds == [
        [
            "git",
            "diff",
            "--no-ext-diff",
            "origin/main...HEAD",
            "--",
            ".",
            ":(exclude,glob).agents/skills/vendored-skill/**/*.py",
            ":(exclude,glob).claude/skills/vendored-skill/**/*.py",
        ],
        [
            "git",
            "diff",
            "--no-ext-diff",
            "--name-only",
            "origin/main...HEAD",
            "--",
            ".",
            ":(exclude,glob).agents/skills/vendored-skill/**/*.py",
            ":(exclude,glob).claude/skills/vendored-skill/**/*.py",
        ],
    ]
