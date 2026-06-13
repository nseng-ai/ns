from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from asdl_core.project_config import AsdlProjectConfigError
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


def test_real_local_diff_cross_checks_parsed_files_with_changed_paths(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cwd = Path("/repo")
    diff_text = (
        "diff --git a/app.py b/app.py\n"
        "index 1111111..2222222 100644\n"
        "--- a/app.py\n"
        "+++ b/app.py\n"
        "@@ -1 +1 @@\n"
        "-old\n"
        "+new\n"
        "diff --git a/old_name.py b/new_name.py\n"
        "similarity index 88%\n"
        "rename from old_name.py\n"
        "rename to new_name.py\n"
        "index 1111111..2222222 100644\n"
        "--- a/old_name.py\n"
        "+++ b/new_name.py\n"
        "@@ -1 +1 @@\n"
        "-old\n"
        "+new\n"
        "diff --git a/deleted.py b/deleted.py\n"
        "deleted file mode 100644\n"
        "index 1111111..0000000\n"
        "--- a/deleted.py\n"
        "+++ /dev/null\n"
        "@@ -1 +0,0 @@\n"
        "-gone\n"
        "diff --git a/image.png b/image.png\n"
        "new file mode 100644\n"
        "index 0000000..1111111\n"
        "Binary files /dev/null and b/image.png differ\n"
    )

    def fake_git_toplevel(*, cwd: Path) -> Path:
        return cwd

    def fake_run_git(cmd: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
        assert cwd == Path("/repo")
        if cmd == ["git", "diff", "--no-ext-diff", "origin/main...HEAD"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=diff_text, stderr="")
        if cmd == ["git", "diff", "--no-ext-diff", "--name-only", "origin/main...HEAD"]:
            return subprocess.CompletedProcess(
                cmd,
                0,
                stdout="app.py\nnew_name.py\ndeleted.py\nimage.png\n",
                stderr="",
            )
        raise AssertionError(f"unexpected command: {cmd!r}")

    monkeypatch.setattr(local_diff_real, "git_toplevel", fake_git_toplevel)
    monkeypatch.setattr(local_diff_real, "run_git", fake_run_git)

    result = RealLocalDiffGateway(cwd=cwd).load_diff(base_ref="main")

    assert isinstance(result, LocalDiff)
    assert {file.path for file in result.files} == set(result.changed_paths)
    assert tuple(file.change_kind for file in result.files) == (
        "modified",
        "renamed",
        "deleted",
        "added",
    )


def test_real_local_diff_applies_configured_diff_excludes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    (tmp_path / "asdl.toml").write_text(
        "[roaster.diff]\n"
        "exclude = [\n"
        '  ".agents/skills/**/*.py",\n'
        '  ".claude/skills/**/*.py",\n'
        "]\n",
        encoding="utf-8",
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
    assert captured_cmds == [
        [
            "git",
            "diff",
            "--no-ext-diff",
            "origin/main...HEAD",
            "--",
            ".",
            ":(exclude,glob).agents/skills/**/*.py",
            ":(exclude,glob).claude/skills/**/*.py",
        ],
        [
            "git",
            "diff",
            "--no-ext-diff",
            "--name-only",
            "origin/main...HEAD",
            "--",
            ".",
            ":(exclude,glob).agents/skills/**/*.py",
            ":(exclude,glob).claude/skills/**/*.py",
        ],
    ]


def test_real_local_diff_invalid_asdl_toml_errors(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    (tmp_path / "asdl.toml").write_text(
        '[roaster.diff]\nexclude = "/tmp/*.py"\n',
        encoding="utf-8",
    )

    def fake_git_toplevel(*, cwd: Path) -> Path:
        return cwd

    monkeypatch.setattr(local_diff_real, "git_toplevel", fake_git_toplevel)

    with pytest.raises(AsdlProjectConfigError, match="array"):
        RealLocalDiffGateway(cwd=tmp_path).load_diff(base_ref="main")
