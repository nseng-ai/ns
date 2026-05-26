from __future__ import annotations

from pathlib import Path

from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import PathTouch
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.list import build_objective_list_result
from asdl_objectives.list_models import ObjectiveListRecord, ObjectiveListResult


def test_build_objective_list_result_reports_checkout_records_and_head_touches(
    tmp_path: Path,
) -> None:
    _objective_dir(tmp_path, "alpha")
    _objective_dir(tmp_path, "closed-one", closed=True)
    git = FakeGitGateway(
        repo_root=tmp_path,
        branches=("master", "feat/ignored"),
        trunk_branch="master",
        path_touch_by_ref_path={
            ("HEAD", ".asdl/objectives/alpha"): PathTouch(
                oid="alpha-touch",
                committed_iso="2026-05-20T10:00:00Z",
            ),
        },
    )
    ctx = ObjectiveCliContext(repo_root=tmp_path, trunk_branch="master", git=git)

    result = build_objective_list_result(ctx, status_filter="all")

    assert result == ObjectiveListResult(
        trunk_branch="master",
        root_path=".asdl/objectives",
        status_filter="all",
        names_only=False,
        records=(
            ObjectiveListRecord(
                slug="alpha",
                status="open",
                latest_update_iso="2026-05-20T10:00:00Z",
            ),
            ObjectiveListRecord(
                slug="closed-one",
                status="closed",
                latest_update_iso=None,
            ),
        ),
    )
    assert git.path_last_touched_calls == (
        ("HEAD", ".asdl/objectives/alpha"),
        ("HEAD", ".asdl/objectives/closed-one"),
    )
    assert git.has_uncommitted_changes_under_calls == (
        (tmp_path, ".asdl/objectives/alpha"),
        (tmp_path, ".asdl/objectives/closed-one"),
    )
    assert git.list_tracked_paths_at_ref_calls == ()
    assert git.tree_oids_at_refs_calls == ()


def test_build_objective_list_result_active_filters_to_open_records(tmp_path: Path) -> None:
    _objective_dir(tmp_path, "alpha")
    _objective_dir(tmp_path, "closed-one", closed=True)
    git = FakeGitGateway(repo_root=tmp_path, branches=("master",), trunk_branch="master")
    ctx = ObjectiveCliContext(repo_root=tmp_path, trunk_branch="master", git=git)

    result = build_objective_list_result(ctx)

    assert [record.slug for record in result.records] == ["alpha"]
    assert result.status_filter == "active"


def test_build_objective_list_result_marks_dirty_records(tmp_path: Path) -> None:
    _objective_dir(tmp_path, "alpha")
    _objective_dir(tmp_path, "beta")
    git = FakeGitGateway(
        repo_root=tmp_path,
        branches=("master",),
        trunk_branch="master",
        uncommitted_changes_by_cwd_path={
            (tmp_path, ".asdl/objectives/alpha"): True,
            (tmp_path, ".asdl/objectives/beta"): False,
        },
    )
    ctx = ObjectiveCliContext(repo_root=tmp_path, trunk_branch="master", git=git)

    result = build_objective_list_result(ctx, status_filter="all")

    assert [record.has_outstanding_changes for record in result.records] == [True, False]


def test_build_objective_list_result_checks_only_filtered_records(tmp_path: Path) -> None:
    _objective_dir(tmp_path, "alpha")
    _objective_dir(tmp_path, "closed-one", closed=True)

    active_git = FakeGitGateway(repo_root=tmp_path, branches=("master",), trunk_branch="master")
    active_ctx = ObjectiveCliContext(repo_root=tmp_path, trunk_branch="master", git=active_git)
    build_objective_list_result(active_ctx)

    closed_git = FakeGitGateway(repo_root=tmp_path, branches=("master",), trunk_branch="master")
    closed_ctx = ObjectiveCliContext(repo_root=tmp_path, trunk_branch="master", git=closed_git)
    build_objective_list_result(closed_ctx, status_filter="closed")

    all_git = FakeGitGateway(repo_root=tmp_path, branches=("master",), trunk_branch="master")
    all_ctx = ObjectiveCliContext(repo_root=tmp_path, trunk_branch="master", git=all_git)
    build_objective_list_result(all_ctx, status_filter="all")

    assert active_git.path_last_touched_calls == (("HEAD", ".asdl/objectives/alpha"),)
    assert active_git.has_uncommitted_changes_under_calls == ((tmp_path, ".asdl/objectives/alpha"),)
    assert closed_git.path_last_touched_calls == (("HEAD", ".asdl/objectives/closed-one"),)
    assert closed_git.has_uncommitted_changes_under_calls == (
        (tmp_path, ".asdl/objectives/closed-one"),
    )
    assert all_git.path_last_touched_calls == (
        ("HEAD", ".asdl/objectives/alpha"),
        ("HEAD", ".asdl/objectives/closed-one"),
    )
    assert all_git.has_uncommitted_changes_under_calls == (
        (tmp_path, ".asdl/objectives/alpha"),
        (tmp_path, ".asdl/objectives/closed-one"),
    )


def test_objective_list_result_json_omits_dirty_state() -> None:
    result = ObjectiveListResult(
        trunk_branch="master",
        root_path=".asdl/objectives",
        status_filter="active",
        names_only=False,
        records=(
            ObjectiveListRecord.create(
                slug="alpha",
                status="open",
                latest_update_iso=None,
                has_outstanding_changes=True,
            ),
        ),
    )

    dumped = result.model_dump(mode="json")

    assert dumped["records"] == [{"slug": "alpha", "status": "open", "latest_update_iso": None}]
    assert set(ObjectiveListRecord.model_json_schema()["properties"]) == {
        "slug",
        "status",
        "latest_update_iso",
    }


def _objective_dir(repo_root: Path, slug: str, *, closed: bool = False) -> Path:
    record = repo_root / ".asdl" / "objectives" / slug
    record.mkdir(parents=True)
    if closed:
        (record / "closed.md").write_text("closed\n", encoding="utf-8")
    return record
