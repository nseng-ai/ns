from __future__ import annotations

from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import PathChangeTouch
from asdl_core.gt.types import GtBranchGraph, GtTrackedBranch
from asdl_objectives.gt_stack_models import ObjectiveStackBranchRow, ObjectiveStackGroup
from asdl_objectives.gt_stack_projection import build_objective_stack_projection

OBJECTIVE_ROOT = ".asdl/objectives"
TRUNK_REF = "refs/heads/main"


def test_build_objective_stack_projection_builds_single_branch_group() -> None:
    graph = _graph(
        _branch("main", None, children=("feat/a",), validation_result="TRUNK"),
        _branch("feat/a", "main", validation_result="OK"),
    )
    git = FakeGitGateway(
        tracked_paths_by_ref_path={
            (TRUNK_REF, OBJECTIVE_ROOT): (".asdl/objectives/alpha/objective.md",),
        },
        path_change_touches_by_ref_path={
            ("main..feat/a", OBJECTIVE_ROOT): (
                _touch(
                    "a-alpha", "2026-05-20T10:00:00-04:00", ".asdl/objectives/alpha/objective.md"
                ),
            ),
        },
    )

    projection = build_objective_stack_projection(git, graph)

    assert projection.trunk == "main"
    assert projection.warnings == ()
    group = _group_for(projection.groups, "alpha")
    assert group.status == "open"
    assert group.objective_branch_count == 1
    assert group.latest_branch == "feat/a"
    assert group.latest_committed_iso == "2026-05-20T10:00:00-04:00"
    assert group.latest_oid == "a-alpha"
    assert group.segments[0].rows == (
        ObjectiveStackBranchRow(
            branch="feat/a",
            parent="main",
            depth=0,
            touches_objective=True,
            also_touches=(),
            validation_result="OK",
        ),
    )


def test_build_objective_stack_projection_carries_needs_restack_to_rows() -> None:
    graph = _graph(
        _branch("main", None, children=("feat/a",)),
        _branch("feat/a", "main", validation_result="VALID", needs_restack=True),
    )
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("main..feat/a", OBJECTIVE_ROOT): (
                _touch(
                    "a-alpha", "2026-05-20T10:00:00-04:00", ".asdl/objectives/alpha/objective.md"
                ),
            ),
        }
    )

    row = (
        _group_for(build_objective_stack_projection(git, graph).groups, "alpha").segments[0].rows[0]
    )

    assert row.validation_result == "VALID"
    assert row.needs_restack is True


def test_build_objective_stack_projection_marks_also_touches_for_many_to_many_branches() -> None:
    graph = _graph(_branch("main", None, children=("feat/a",)), _branch("feat/a", "main"))
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("main..feat/a", OBJECTIVE_ROOT): (
                _touch(
                    "multi",
                    "2026-05-20T10:00:00-04:00",
                    ".asdl/objectives/alpha/objective.md",
                    ".asdl/objectives/beta/objective.md",
                ),
            ),
        }
    )

    projection = build_objective_stack_projection(git, graph)

    assert _group_for(projection.groups, "alpha").segments[0].rows[0].also_touches == ("beta",)
    assert _group_for(projection.groups, "beta").segments[0].rows[0].also_touches == ("alpha",)


def test_build_objective_stack_projection_splits_disconnected_segments() -> None:
    graph = _graph(
        _branch("main", None, children=("feat/a", "feat/b")),
        _branch("feat/a", "main"),
        _branch("feat/b", "main"),
    )
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("main..feat/a", OBJECTIVE_ROOT): (
                _touch(
                    "a-alpha", "2026-05-20T10:00:00-04:00", ".asdl/objectives/alpha/objective.md"
                ),
            ),
            ("main..feat/b", OBJECTIVE_ROOT): (
                _touch(
                    "b-alpha",
                    "2026-05-20T11:00:00-04:00",
                    ".asdl/objectives/alpha/updates/progress.md",
                ),
            ),
        }
    )

    group = _group_for(build_objective_stack_projection(git, graph).groups, "alpha")

    assert group.objective_branch_count == 2
    assert tuple(tuple(row.branch for row in segment.rows) for segment in group.segments) == (
        ("feat/a",),
        ("feat/b",),
    )


def test_build_objective_stack_projection_includes_trunk_connector() -> None:
    graph = _graph(
        _branch("main", None, children=("feat/connector",)),
        _branch("feat/connector", "main", children=("feat/child",)),
        _branch("feat/child", "feat/connector"),
    )
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("feat/connector..feat/child", OBJECTIVE_ROOT): (
                _touch(
                    "child-alpha",
                    "2026-05-20T10:00:00-04:00",
                    ".asdl/objectives/alpha/objective.md",
                ),
            ),
        }
    )

    group = _group_for(build_objective_stack_projection(git, graph).groups, "alpha")

    assert group.objective_branch_count == 1
    assert group.segments[0].rows == (
        ObjectiveStackBranchRow(
            branch="feat/connector",
            parent="main",
            depth=0,
            touches_objective=False,
            also_touches=(),
            validation_result=None,
        ),
        ObjectiveStackBranchRow(
            branch="feat/child",
            parent="feat/connector",
            depth=1,
            touches_objective=True,
            also_touches=(),
            validation_result=None,
        ),
    )


def test_build_objective_stack_projection_includes_connector_between_touched_branches() -> None:
    graph = _graph(
        _branch("main", None, children=("feat/a",)),
        _branch("feat/a", "main", children=("feat/connector",)),
        _branch("feat/connector", "feat/a", children=("feat/c",)),
        _branch("feat/c", "feat/connector"),
    )
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("main..feat/a", OBJECTIVE_ROOT): (
                _touch(
                    "a-alpha", "2026-05-20T09:00:00-04:00", ".asdl/objectives/alpha/objective.md"
                ),
            ),
            ("feat/connector..feat/c", OBJECTIVE_ROOT): (
                _touch("c-alpha", "2026-05-20T10:00:00-04:00", ".asdl/objectives/alpha/closed.md"),
            ),
        }
    )

    group = _group_for(build_objective_stack_projection(git, graph).groups, "alpha")

    assert group.objective_branch_count == 2
    assert tuple(
        (row.branch, row.depth, row.touches_objective) for row in group.segments[0].rows
    ) == (
        ("feat/a", 0, True),
        ("feat/connector", 1, False),
        ("feat/c", 2, True),
    )


def test_build_objective_stack_projection_uses_objective_touch_timestamps_for_latest_work() -> None:
    graph = _graph(
        _branch("main", None, children=("feat/old", "feat/new")),
        _branch("feat/old", "main"),
        _branch("feat/new", "main"),
    )
    git = FakeGitGateway(
        branches=("feat/old", "feat/new"),
        branch_head_iso_by_branch={
            "feat/old": "2026-05-20T08:00:00-04:00",
            "feat/new": "2026-05-20T12:00:00-04:00",
        },
        path_change_touches_by_ref_path={
            ("main..feat/old", OBJECTIVE_ROOT): (
                _touch(
                    "old-alpha", "2026-05-20T11:00:00-04:00", ".asdl/objectives/alpha/objective.md"
                ),
            ),
            ("main..feat/new", OBJECTIVE_ROOT): (
                _touch(
                    "new-alpha", "2026-05-20T09:00:00-04:00", ".asdl/objectives/alpha/objective.md"
                ),
            ),
        },
    )

    group = _group_for(build_objective_stack_projection(git, graph).groups, "alpha")

    assert group.latest_branch == "feat/old"
    assert group.latest_committed_iso == "2026-05-20T11:00:00-04:00"
    assert group.latest_oid == "old-alpha"


def test_build_objective_stack_projection_derives_open_closed_and_in_flight_statuses() -> None:
    graph = _graph(
        _branch("main", None, children=("feat/open", "feat/closed", "feat/flight")),
        _branch("feat/open", "main"),
        _branch("feat/closed", "main"),
        _branch("feat/flight", "main"),
    )
    git = FakeGitGateway(
        tracked_paths_by_ref_path={
            (TRUNK_REF, OBJECTIVE_ROOT): (
                ".asdl/objectives/open/objective.md",
                ".asdl/objectives/closed/objective.md",
                ".asdl/objectives/closed/closed.md",
            ),
        },
        path_change_touches_by_ref_path={
            ("main..feat/open", OBJECTIVE_ROOT): (
                _touch(
                    "open-touch", "2026-05-20T09:00:00-04:00", ".asdl/objectives/open/objective.md"
                ),
            ),
            ("main..feat/closed", OBJECTIVE_ROOT): (
                _touch(
                    "closed-touch", "2026-05-20T10:00:00-04:00", ".asdl/objectives/closed/closed.md"
                ),
            ),
            ("main..feat/flight", OBJECTIVE_ROOT): (
                _touch(
                    "flight-touch",
                    "2026-05-20T11:00:00-04:00",
                    ".asdl/objectives/flight/objective.md",
                ),
            ),
        },
    )

    projection = build_objective_stack_projection(git, graph)

    assert _group_for(projection.groups, "open").status == "open"
    assert _group_for(projection.groups, "closed").status == "closed"
    assert _group_for(projection.groups, "flight").status == "in-flight"


def test_build_objective_stack_projection_adds_missing_parent_warning() -> None:
    graph = GtBranchGraph(
        trunk="main",
        branches=(
            _branch("main", None),
            _branch("feat/orphan", "feat/missing"),
        ),
        warnings=("metadata warning",),
    )
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("feat/missing..feat/orphan", OBJECTIVE_ROOT): (
                _touch(
                    "orphan-alpha",
                    "2026-05-20T10:00:00-04:00",
                    ".asdl/objectives/alpha/objective.md",
                ),
            ),
        }
    )

    projection = build_objective_stack_projection(git, graph)

    assert projection.warnings[0] == "metadata warning"
    assert projection.warnings[1] == (
        "Objective 'alpha': branch 'feat/orphan' references missing Graphite parent "
        "'feat/missing'; ancestor walk stopped."
    )


def _branch(
    name: str,
    parent: str | None,
    *,
    children: tuple[str, ...] = (),
    validation_result: str | None = None,
    needs_restack: bool = False,
) -> GtTrackedBranch:
    return GtTrackedBranch(
        name=name,
        parent=parent,
        children=children,
        validation_result=validation_result,
        needs_restack=needs_restack,
    )


def _graph(*branches: GtTrackedBranch) -> GtBranchGraph:
    return GtBranchGraph(trunk="main", branches=branches, warnings=())


def _touch(oid: str, committed_iso: str, *paths: str) -> PathChangeTouch:
    return PathChangeTouch(oid=oid, committed_iso=committed_iso, paths=paths)


def _group_for(groups: tuple[ObjectiveStackGroup, ...], slug: str) -> ObjectiveStackGroup:
    matches = [group for group in groups if group.slug == slug]
    assert len(matches) == 1
    return matches[0]
