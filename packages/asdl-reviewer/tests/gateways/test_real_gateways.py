from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from asdl_reviewer.gateways.local_diff import real as local_diff_real
from asdl_reviewer.gateways.local_diff.real import RealLocalDiffGateway
from asdl_reviewer.gateways.review_catalog import real as review_catalog_real
from asdl_reviewer.gateways.review_catalog.real import RealReviewCatalogGateway
from asdl_reviewer.models import LocalDiff, ReviewSource


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

    def fake_git_toplevel(*, cwd: Path) -> Path:
        return cwd

    def fake_run_git(cmd: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
        assert cwd == Path("/repo")
        if cmd[:3] == ["git", "diff", "--no-ext-diff"]:
            return subprocess.CompletedProcess(
                cmd,
                0,
                stdout="diff --git a/app.py b/app.py\n+print('hello')\n",
                stderr="",
            )
        raise AssertionError(f"unexpected command: {cmd!r}")

    monkeypatch.setattr(local_diff_real, "git_toplevel", fake_git_toplevel)
    monkeypatch.setattr(local_diff_real, "run_git", fake_run_git)

    result = RealLocalDiffGateway(cwd=cwd).load_diff(base_ref="master")

    assert isinstance(result, LocalDiff)
    assert result.base_ref == "master"
    assert "diff --git a/app.py b/app.py" in result.diff_text
