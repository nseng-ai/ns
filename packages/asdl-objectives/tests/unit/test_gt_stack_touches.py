from __future__ import annotations

import pytest

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import GitCommandFailure, PathChangeTouch
from asdl_core.gt.types import GtBranchGraph, GtTrackedBranch
from asdl_objectives.gt_stack_models import ObjectiveBranchTouch
from asdl_objectives.gt_stack_touches import build_objective_branch_touch_index
from asdl_objectives.objective_paths import objective_slug_from_active_path

OBJECTIVE_ROOT = ".asdl/objectives"


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        (".asdl/objectives/alpha/objective.md", "alpha"),
        (".asdl/objectives/alpha/closed.md", "alpha"),
        (".asdl/objectives/alpha/updates/progress.md", "alpha"),
        (".asdl/objectives", None),
        (".asdl/objectives/alpha", None),
        (".asdl/objectives/alpha/", None),
        (".asdl/objective-archive/alpha/objective.md", None),
        ("other/alpha/objective.md", None),
        (".asdl/objectives/./objective.md", None),
        (".asdl/objectives/../objective.md", None),
    ],
)
def test_objective_slug_from_active_path_extracts_only_active_record_file_slugs(
    path: str,
    expected: str | None,
) -> None:
    assert objective_slug_from_active_path(path) == expected


def test_build_objective_branch_touch_index_queries_graphite_parent_ranges() -> None:
    graph = _graph(
        _branch("main", None, children=("feat/a",)),
        _branch("feat/a", "main", children=("feat/b",)),
        _branch("feat/b", "feat/a"),
    )
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("main..feat/a", OBJECTIVE_ROOT): (
                _touch(
                    "a-alpha", "2026-05-20T10:00:00-04:00", ".asdl/objectives/alpha/objective.md"
                ),
            ),
            ("feat/a..feat/b", OBJECTIVE_ROOT): (),
        }
    )

    index = build_objective_branch_touch_index(git, graph)

    assert git.path_touches_under_calls == (
        ("main..feat/a", OBJECTIVE_ROOT),
        ("feat/a..feat/b", OBJECTIVE_ROOT),
    )
    assert index.summaries_by_branch["feat/a"].touched_slugs == ("alpha",)
    assert index.summaries_by_branch["feat/b"].touched_slugs == ()


def test_build_objective_branch_touch_index_records_multiple_slugs_from_one_commit() -> None:
    graph = _graph(_branch("main", None, children=("feat/a",)), _branch("feat/a", "main"))
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("main..feat/a", OBJECTIVE_ROOT): (
                _touch(
                    "multi",
                    "2026-05-20T10:00:00-04:00",
                    ".asdl/objectives/alpha/objective.md",
                    ".asdl/objectives/beta/updates/progress.md",
                ),
            ),
        }
    )

    summary = build_objective_branch_touch_index(git, graph).summaries_by_branch["feat/a"]

    assert summary.touched_slugs == ("alpha", "beta")
    assert summary.latest_touch_by_slug == {
        "alpha": ObjectiveBranchTouch(
            branch="feat/a",
            slug="alpha",
            oid="multi",
            committed_iso="2026-05-20T10:00:00-04:00",
        ),
        "beta": ObjectiveBranchTouch(
            branch="feat/a",
            slug="beta",
            oid="multi",
            committed_iso="2026-05-20T10:00:00-04:00",
        ),
    }


def test_build_objective_branch_touch_index_keeps_newest_touch_per_branch_slug() -> None:
    graph = _graph(_branch("main", None, children=("feat/a",)), _branch("feat/a", "main"))
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("main..feat/a", OBJECTIVE_ROOT): (
                _touch("older", "2026-05-20T09:00:00-04:00", ".asdl/objectives/alpha/objective.md"),
                _touch("newer", "2026-05-20T11:00:00-04:00", ".asdl/objectives/alpha/closed.md"),
            ),
        }
    )

    summary = build_objective_branch_touch_index(git, graph).summaries_by_branch["feat/a"]

    assert summary.latest_touch_by_slug["alpha"] == ObjectiveBranchTouch(
        branch="feat/a",
        slug="alpha",
        oid="newer",
        committed_iso="2026-05-20T11:00:00-04:00",
    )


def test_build_objective_branch_touch_index_ignores_archive_root_only_touches() -> None:
    graph = _graph(_branch("main", None, children=("feat/a",)), _branch("feat/a", "main"))
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("main..feat/a", OBJECTIVE_ROOT): (
                _touch(
                    "archive-only",
                    "2026-05-20T11:00:00-04:00",
                    ".asdl/objective-archive/alpha/objective.md",
                ),
                _touch(
                    "active-delete",
                    "2026-05-20T10:00:00-04:00",
                    ".asdl/objectives/beta/objective.md",
                ),
            ),
        }
    )

    summary = build_objective_branch_touch_index(git, graph).summaries_by_branch["feat/a"]

    assert summary.touched_slugs == ("beta",)
    assert summary.latest_touch_by_slug["beta"].oid == "active-delete"


def test_build_objective_branch_touch_index_raises_clinkr_failure_on_git_failure() -> None:
    graph = _graph(_branch("main", None, children=("feat/a",)), _branch("feat/a", "main"))
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("main..feat/a", OBJECTIVE_ROOT): GitCommandFailure(
                message="bad revision",
                returncode=128,
            ),
        }
    )

    with pytest.raises(ClinkrFailure) as exc_info:
        build_objective_branch_touch_index(git, graph)

    assert exc_info.value.error_type == "git_objective_stack_touches_failed"
    assert exc_info.value.message == "bad revision"


def _branch(
    name: str,
    parent: str | None,
    *,
    children: tuple[str, ...] = (),
    validation_result: str | None = None,
) -> GtTrackedBranch:
    return GtTrackedBranch(
        name=name,
        parent=parent,
        children=children,
        validation_result=validation_result,
    )


def _graph(*branches: GtTrackedBranch) -> GtBranchGraph:
    return GtBranchGraph(trunk="main", branches=branches, warnings=())


def _touch(oid: str, committed_iso: str, *paths: str) -> PathChangeTouch:
    return PathChangeTouch(oid=oid, committed_iso=committed_iso, paths=paths)
