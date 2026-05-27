from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import PathChangeTouch
from asdl_core.gt.testing import FakeGtGateway
from asdl_core.gt.types import GtBranchGraph, GtTrackedBranch
from asdl_objectives.gt_stack_projection import (
    ObjectiveGtStackProjection,
    build_objective_gt_stack_projection,
)


def test_build_objective_gt_stack_projection_matches_worked_example() -> None:
    repo_root = Path("/repo")
    git = FakeGitGateway(
        branches=("main", "feat/a", "feat/connector", "feat/c", "feat/b"),
        tracked_paths_by_ref_path={
            ("refs/heads/main", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="a-multi",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(
                        ".asdl/objectives/alpha/objective.md",
                        ".asdl/objectives/beta/objective.md",
                    ),
                ),
            ),
            ("feat/a..feat/connector", ".asdl/objectives"): (),
            ("feat/connector..feat/c", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="c-alpha",
                    committed_iso="2026-05-20T11:00:00Z",
                    paths=(".asdl/objectives/alpha/updates/progress.md",),
                ),
            ),
            ("main..feat/b", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="b-alpha",
                    committed_iso="2026-05-20T12:00:00Z",
                    paths=(".asdl/objectives/alpha/updates/progress.md",),
                ),
            ),
        },
    )
    gt = FakeGtGateway(branch_graph=_worked_example_graph())

    projection = build_objective_gt_stack_projection(repo_root, git, gt)

    assert projection.to_json_data() == {
        "trunk_branch": "main",
        "warnings": [],
        "objectives": [
            {
                "slug": "alpha",
                "status": "open",
                "objective_branch_count": 3,
                "segment_count": 2,
                "latest_work": {
                    "branch": "feat/b",
                    "committed_iso": "2026-05-20T12:00:00Z",
                    "oid": "b-alpha",
                },
                "segments": [
                    {
                        "index": 1,
                        "rows": [
                            {
                                "branch": "feat/a",
                                "parent": "main",
                                "depth": 0,
                                "touches_objective": True,
                                "connector": False,
                                "also_touches": ["beta"],
                                "validation_result": "OK",
                                "needs_restack": False,
                            },
                            {
                                "branch": "feat/connector",
                                "parent": "feat/a",
                                "depth": 1,
                                "touches_objective": False,
                                "connector": True,
                                "also_touches": [],
                                "validation_result": "VALID",
                                "needs_restack": True,
                            },
                            {
                                "branch": "feat/c",
                                "parent": "feat/connector",
                                "depth": 2,
                                "touches_objective": True,
                                "connector": False,
                                "also_touches": [],
                                "validation_result": None,
                                "needs_restack": False,
                            },
                        ],
                    },
                    {
                        "index": 2,
                        "rows": [
                            {
                                "branch": "feat/b",
                                "parent": "main",
                                "depth": 0,
                                "touches_objective": True,
                                "connector": False,
                                "also_touches": [],
                                "validation_result": None,
                                "needs_restack": False,
                            },
                        ],
                    },
                ],
            },
            {
                "slug": "beta",
                "status": "in-flight",
                "objective_branch_count": 1,
                "segment_count": 1,
                "latest_work": {
                    "branch": "feat/a",
                    "committed_iso": "2026-05-20T10:00:00Z",
                    "oid": "a-multi",
                },
                "segments": [
                    {
                        "index": 1,
                        "rows": [
                            {
                                "branch": "feat/a",
                                "parent": "main",
                                "depth": 0,
                                "touches_objective": True,
                                "connector": False,
                                "also_touches": ["alpha"],
                                "validation_result": "OK",
                                "needs_restack": False,
                            },
                        ],
                    },
                ],
            },
        ],
    }


def test_projection_ignores_archive_root_paths_when_branch_change_data_includes_them() -> None:
    repo_root = Path("/repo")
    git = FakeGitGateway(
        branches=("main", "feat/alpha", "feat/archive-only"),
        tracked_paths_by_ref_path={
            ("refs/heads/main", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
        path_change_touches_by_ref_path={
            ("main..feat/alpha", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="mixed-active-and-archive",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(
                        ".asdl/objectives/alpha/objective.md",
                        ".asdl/objective-archive/beta/objective.md",
                    ),
                ),
            ),
            ("main..feat/archive-only", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="archive-only",
                    committed_iso="2026-05-20T11:00:00Z",
                    paths=(".asdl/objective-archive/gamma/objective.md",),
                ),
            ),
        },
    )
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                GtTrackedBranch(
                    name="main",
                    parent=None,
                    children=("feat/alpha", "feat/archive-only"),
                    validation_result="TRUNK",
                ),
                GtTrackedBranch(
                    name="feat/alpha",
                    parent="main",
                    children=(),
                    validation_result=None,
                ),
                GtTrackedBranch(
                    name="feat/archive-only",
                    parent="main",
                    children=(),
                    validation_result=None,
                ),
            ),
            warnings=(),
        )
    )

    projection = build_objective_gt_stack_projection(repo_root, git, gt)

    objectives = _projection_objectives_json(projection)
    assert [objective["slug"] for objective in objectives] == ["alpha"]
    alpha = objectives[0]
    assert alpha["objective_branch_count"] == 1
    assert alpha["latest_work"] == {
        "branch": "feat/alpha",
        "committed_iso": "2026-05-20T10:00:00Z",
        "oid": "mixed-active-and-archive",
    }
    rows = alpha["segments"][0]["rows"]
    assert [row["branch"] for row in rows] == ["feat/alpha"]
    assert rows[0]["also_touches"] == []


def test_projection_scans_only_trunk_connected_local_graphite_branches() -> None:
    repo_root = Path("/repo")
    git = FakeGitGateway(
        branches=("main", "feat/good", "feat/child", "feat/untracked"),
        path_change_touches_by_ref_path={
            ("main..feat/good", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="good-alpha",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/objective.md",),
                ),
            ),
            ("feat/missing..feat/child", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="child-beta",
                    committed_iso="2026-05-20T11:00:00Z",
                    paths=(".asdl/objectives/beta/objective.md",),
                ),
            ),
            ("main..feat/untracked", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="untracked-gamma",
                    committed_iso="2026-05-20T12:00:00Z",
                    paths=(".asdl/objectives/gamma/objective.md",),
                ),
            ),
        },
    )
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                GtTrackedBranch(
                    name="main",
                    parent=None,
                    children=("feat/good", "feat/missing", "feat/missing"),
                    validation_result="TRUNK",
                ),
                GtTrackedBranch(
                    name="feat/good",
                    parent="main",
                    children=(),
                    validation_result=None,
                ),
                GtTrackedBranch(
                    name="feat/missing",
                    parent="main",
                    children=("feat/child",),
                    validation_result=None,
                ),
                GtTrackedBranch(
                    name="feat/child",
                    parent="feat/missing",
                    children=(),
                    validation_result=None,
                ),
            ),
            warnings=("metadata warning", "metadata warning"),
        )
    )

    projection = build_objective_gt_stack_projection(repo_root, git, gt)

    assert projection.to_json_data()["warnings"] == [
        "metadata warning",
        "Graphite branch 'feat/child' has unavailable local parent 'feat/missing'; skipping.",
    ]
    assert [objective["slug"] for objective in _projection_objectives_json(projection)] == ["alpha"]
    assert git.path_touches_under_calls == (("main..feat/good", ".asdl/objectives"),)
    assert gt.branch_graph_calls == (repo_root,)


def test_projection_latest_work_ties_by_timestamp_then_branch_then_oid() -> None:
    repo_root = Path("/repo")
    git = FakeGitGateway(
        branches=("main", "feat/b", "feat/a"),
        path_change_touches_by_ref_path={
            ("main..feat/b", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="b-oid",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/objective.md",),
                ),
            ),
            ("main..feat/a", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="z-oid",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/objective.md",),
                ),
                PathChangeTouch(
                    oid="a-oid",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/updates/progress.md",),
                ),
            ),
        },
    )
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                GtTrackedBranch(
                    name="main",
                    parent=None,
                    children=("feat/b", "feat/a"),
                    validation_result="TRUNK",
                ),
                GtTrackedBranch(
                    name="feat/b",
                    parent="main",
                    children=(),
                    validation_result=None,
                ),
                GtTrackedBranch(
                    name="feat/a",
                    parent="main",
                    children=(),
                    validation_result=None,
                ),
            ),
            warnings=(),
        )
    )

    projection = build_objective_gt_stack_projection(repo_root, git, gt)

    alpha = _projection_objectives_json(projection)[0]
    assert alpha["latest_work"] == {
        "branch": "feat/a",
        "committed_iso": "2026-05-20T10:00:00Z",
        "oid": "a-oid",
    }


def test_projection_projects_closed_status_from_trunk() -> None:
    repo_root = Path("/repo")
    git = FakeGitGateway(
        branches=("main", "feat/done"),
        tracked_paths_by_ref_path={
            ("refs/heads/main", ".asdl/objectives"): (
                ".asdl/objectives/done/objective.md",
                ".asdl/objectives/done/closed.md",
            ),
        },
        path_change_touches_by_ref_path={
            ("main..feat/done", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="done-touch",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/done/closed.md",),
                ),
            ),
        },
    )
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                GtTrackedBranch(
                    name="main",
                    parent=None,
                    children=("feat/done",),
                    validation_result="TRUNK",
                ),
                GtTrackedBranch(
                    name="feat/done",
                    parent="main",
                    children=(),
                    validation_result=None,
                ),
            ),
            warnings=(),
        )
    )

    projection = build_objective_gt_stack_projection(repo_root, git, gt)

    assert _projection_objectives_json(projection)[0]["status"] == "closed"


def _projection_objectives_json(projection: ObjectiveGtStackProjection) -> list[dict[str, Any]]:
    objectives = projection.to_json_data()["objectives"]
    assert isinstance(objectives, list)
    assert all(isinstance(objective, dict) for objective in objectives)
    return cast("list[dict[str, Any]]", objectives)


def _worked_example_graph() -> GtBranchGraph:
    return GtBranchGraph(
        trunk="main",
        branches=(
            GtTrackedBranch(
                name="main",
                parent=None,
                children=("feat/a", "feat/b"),
                validation_result="TRUNK",
            ),
            GtTrackedBranch(
                name="feat/a",
                parent="main",
                children=("feat/connector",),
                validation_result="OK",
            ),
            GtTrackedBranch(
                name="feat/connector",
                parent="feat/a",
                children=("feat/c",),
                validation_result="VALID",
                needs_restack=True,
            ),
            GtTrackedBranch(
                name="feat/c",
                parent="feat/connector",
                children=(),
                validation_result=None,
            ),
            GtTrackedBranch(
                name="feat/b",
                parent="main",
                children=(),
                validation_result=None,
            ),
        ),
        warnings=(),
    )
