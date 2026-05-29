from __future__ import annotations

from pathlib import Path

from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import GitCommandFailure, PathChangeTouch
from asdl_core.gt.testing import FakeGtGateway
from asdl_core.gt.types import GtBranchGraph, GtCommandFailure, GtTrackedBranch
from asdl_objectives.gt.projection import (
    ObjectiveStackGroup,
    ObjectiveStackLatestWork,
    ObjectiveStackProjection,
    ObjectiveStackRow,
    ObjectiveStackSegment,
    _BranchTouch,
    _compute_branch_touches,
    _SliceReadFailure,
    _TrunkStatusReadFailure,
    project_objective_stacks,
)

# ---------------------------------------------------------------------------
# Shared fixture builders
# ---------------------------------------------------------------------------


def _trunk_node(name: str, children: tuple[str, ...]) -> GtTrackedBranch:
    return GtTrackedBranch(name=name, parent=None, children=children, validation_result="TRUNK")


# ---------------------------------------------------------------------------
# P1 — Projection skeleton + empty case
# ---------------------------------------------------------------------------


def test_p1_trunk_only_graph_returns_empty_projection() -> None:
    gt = FakeGtGateway(trunk="main")
    git = FakeGitGateway(branches=("main",), trunk_branch="main")

    result = project_objective_stacks(gt, git, trunk_ref="refs/heads/main", cwd=Path("/repo"))

    assert result == ObjectiveStackProjection(
        trunk_branch="main",
        warnings=(),
        objectives=(),
    )


# ---------------------------------------------------------------------------
# P2 — Branch scope selection
# ---------------------------------------------------------------------------


def test_p2_branch_with_unavailable_local_parent_is_skipped_with_warning() -> None:
    # main -> feat/x -> feat/y, but feat/x is not present locally.
    # feat/x is excluded (not local); feat/y is severed and excluded with a warning.
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                _trunk_node("main", ("feat/x",)),
                GtTrackedBranch(
                    name="feat/x",
                    parent="main",
                    children=("feat/y",),
                    validation_result="OK",
                ),
                GtTrackedBranch(
                    name="feat/y",
                    parent="feat/x",
                    children=(),
                    validation_result="OK",
                ),
            ),
            warnings=(),
        )
    )
    # feat/x is NOT in the local branch set; feat/y touches alpha.
    git = FakeGitGateway(
        branches=("main", "feat/y"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("feat/x..feat/y", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="y-alpha",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/objective.md",),
                ),
            ),
        },
    )

    result = project_objective_stacks(gt, git, trunk_ref="refs/heads/main", cwd=Path("/repo"))

    assert isinstance(result, ObjectiveStackProjection)
    # feat/y dropped -> no objective work survives.
    assert result.objectives == ()
    assert result.warnings == (
        "Graphite branch 'feat/y' has unavailable local parent 'feat/x'; skipping.",
    )


def test_p2_untracked_local_branch_is_excluded() -> None:
    # feat/extra is present locally but is NOT a tracked node in the graph;
    # it never appears in scope.
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(_trunk_node("main", ()),),
            warnings=(),
        )
    )
    git = FakeGitGateway(
        branches=("main", "feat/extra"),
        trunk_branch="main",
    )

    result = project_objective_stacks(gt, git, trunk_ref="refs/heads/main", cwd=Path("/repo"))

    assert isinstance(result, ObjectiveStackProjection)
    assert result.objectives == ()
    assert result.warnings == ()


# ---------------------------------------------------------------------------
# P3 — Per-branch touches
# ---------------------------------------------------------------------------


def test_p3_branch_records_latest_touch_per_slug() -> None:
    # feat/a slice touches alpha (twice) and beta; keep the newest per slug.
    git = FakeGitGateway(
        branches=("main", "feat/a"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): (
                # newest-first ordering as git emits
                PathChangeTouch(
                    oid="a-new",
                    committed_iso="2026-05-20T12:00:00Z",
                    paths=(".asdl/objectives/alpha/updates/progress.md",),
                ),
                PathChangeTouch(
                    oid="a-multi",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(
                        ".asdl/objectives/alpha/objective.md",
                        ".asdl/objectives/beta/objective.md",
                    ),
                ),
            ),
        },
    )

    touches = _compute_branch_touches(git, branch="feat/a", parent="main")

    assert isinstance(touches, dict)
    assert touches == {
        "alpha": _BranchTouch(oid="a-new", committed_iso="2026-05-20T12:00:00Z"),
        "beta": _BranchTouch(oid="a-multi", committed_iso="2026-05-20T10:00:00Z"),
    }


def test_p3_archive_and_bare_dir_paths_do_not_register() -> None:
    git = FakeGitGateway(
        branches=("main", "feat/a"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="noise",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(
                        # archive root: ignored
                        ".asdl/objective-archive/gamma/objective.md",
                        # bare directory (no child): not a touch
                        ".asdl/objectives/delta",
                        # real touch
                        ".asdl/objectives/alpha/objective.md",
                    ),
                ),
            ),
        },
    )

    touches = _compute_branch_touches(git, branch="feat/a", parent="main")

    assert touches == {
        "alpha": _BranchTouch(oid="noise", committed_iso="2026-05-20T10:00:00Z"),
    }


def test_p3_deletion_registers_as_touch() -> None:
    # PathChangeTouch carries no change-kind; a deleted active record path is
    # simply a touched path and must register.
    git = FakeGitGateway(
        branches=("main", "feat/a"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="del",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/objective.md",),
                ),
            ),
        },
    )

    touches = _compute_branch_touches(git, branch="feat/a", parent="main")

    assert touches == {
        "alpha": _BranchTouch(oid="del", committed_iso="2026-05-20T10:00:00Z"),
    }


def test_p3_slice_read_failure_is_returned() -> None:
    git = FakeGitGateway(
        branches=("main", "feat/a"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): GitCommandFailure(message="boom", returncode=128),
        },
    )

    touches = _compute_branch_touches(git, branch="feat/a", parent="main")

    assert isinstance(touches, GitCommandFailure)
    assert touches.message == "boom"


# ---------------------------------------------------------------------------
# P4 — Grouping by Objective + also_touches
# ---------------------------------------------------------------------------


def test_p4_multi_touch_branch_appears_under_each_group_with_also_touches() -> None:
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                _trunk_node("main", ("feat/a",)),
                GtTrackedBranch(
                    name="feat/a",
                    parent="main",
                    children=(),
                    validation_result="OK",
                ),
            ),
            warnings=(),
        )
    )
    git = FakeGitGateway(
        branches=("main", "feat/a"),
        trunk_branch="main",
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
        },
    )

    result = project_objective_stacks(gt, git, trunk_ref="refs/heads/main", cwd=Path("/repo"))

    assert isinstance(result, ObjectiveStackProjection)
    slugs = [group.slug for group in result.objectives]
    assert slugs == ["alpha", "beta"]

    alpha = result.objectives[0]
    beta = result.objectives[1]
    alpha_row = alpha.segments[0].rows[0]
    beta_row = beta.segments[0].rows[0]

    assert alpha_row.branch == "feat/a"
    assert alpha_row.also_touches == ("beta",)
    assert beta_row.branch == "feat/a"
    assert beta_row.also_touches == ("alpha",)


# ---------------------------------------------------------------------------
# Section-10 alpha fixture builders (reused by P5, P7, P8)
# ---------------------------------------------------------------------------


def _section10_gt() -> FakeGtGateway:
    return FakeGtGateway(
        branch_graph=GtBranchGraph(
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
    )


def _section10_git() -> FakeGitGateway:
    return FakeGitGateway(
        repo_root=Path("/repo"),
        branches=("main", "feat/a", "feat/connector", "feat/c", "feat/b"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="a-multi",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(
                        ".asdl/objectives/alpha/o.md",
                        ".asdl/objectives/beta/o.md",
                    ),
                ),
            ),
            ("feat/connector..feat/c", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="c-alpha",
                    committed_iso="2026-05-20T11:00:00Z",
                    paths=(".asdl/objectives/alpha/o.md",),
                ),
            ),
            ("main..feat/b", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="b-alpha",
                    committed_iso="2026-05-20T12:00:00Z",
                    paths=(".asdl/objectives/alpha/o.md",),
                ),
            ),
            # feat/connector slice intentionally unseeded -> () -> touches nothing
        },
        tracked_paths_by_ref_path={
            ("refs/heads/main", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            # no beta on trunk -> beta is in-flight
        },
    )


# ---------------------------------------------------------------------------
# P5 — Segments + connectors
# ---------------------------------------------------------------------------


def test_p5_alpha_has_two_segments_with_connector() -> None:
    result = project_objective_stacks(
        _section10_gt(),
        _section10_git(),
        trunk_ref="refs/heads/main",
        cwd=Path("/repo"),
    )

    assert isinstance(result, ObjectiveStackProjection)
    alpha = next(g for g in result.objectives if g.slug == "alpha")

    assert alpha.segment_count == 2
    assert alpha.objective_branch_count == 3  # a, c, b -- connector excluded

    seg1 = alpha.segments[0]
    assert [row.branch for row in seg1.rows] == [
        "feat/a",
        "feat/connector",
        "feat/c",
    ]
    connector_row = seg1.rows[1]
    assert connector_row.branch == "feat/connector"
    assert connector_row.connector is True
    assert connector_row.touches_objective is False

    seg2 = alpha.segments[1]
    assert [row.branch for row in seg2.rows] == ["feat/b"]

    # feat/connector does NOT appear under beta (beta's only branch is feat/a).
    beta = next(g for g in result.objectives if g.slug == "beta")
    beta_branches = [row.branch for seg in beta.segments for row in seg.rows]
    assert beta_branches == ["feat/a"]


# ---------------------------------------------------------------------------
# P6 — Projected status (from trunk)
# ---------------------------------------------------------------------------


def _single_branch_gt() -> FakeGtGateway:
    return FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                _trunk_node("main", ("feat/a",)),
                GtTrackedBranch(
                    name="feat/a",
                    parent="main",
                    children=(),
                    validation_result="OK",
                ),
            ),
            warnings=(),
        )
    )


def _single_branch_git(trunk_paths: tuple[str, ...]) -> FakeGitGateway:
    return FakeGitGateway(
        branches=("main", "feat/a"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="a",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/objective.md",),
                ),
            ),
        },
        tracked_paths_by_ref_path={
            ("refs/heads/main", ".asdl/objectives"): trunk_paths,
        },
    )


def test_p6_status_open_when_present_without_closed_marker() -> None:
    result = project_objective_stacks(
        _single_branch_gt(),
        _single_branch_git((".asdl/objectives/alpha/objective.md",)),
        trunk_ref="refs/heads/main",
        cwd=Path("/repo"),
    )
    assert isinstance(result, ObjectiveStackProjection)
    assert result.objectives[0].status == "open"


def test_p6_status_closed_when_closed_marker_present() -> None:
    result = project_objective_stacks(
        _single_branch_gt(),
        _single_branch_git(
            (
                ".asdl/objectives/alpha/objective.md",
                ".asdl/objectives/alpha/closed.md",
            )
        ),
        trunk_ref="refs/heads/main",
        cwd=Path("/repo"),
    )
    assert isinstance(result, ObjectiveStackProjection)
    assert result.objectives[0].status == "closed"


def test_p6_status_in_flight_when_absent_on_trunk() -> None:
    result = project_objective_stacks(
        _single_branch_gt(),
        _single_branch_git(()),  # alpha not on trunk
        trunk_ref="refs/heads/main",
        cwd=Path("/repo"),
    )
    assert isinstance(result, ObjectiveStackProjection)
    assert result.objectives[0].status == "in-flight"


# ---------------------------------------------------------------------------
# P7 — Latest work
# ---------------------------------------------------------------------------


def test_p7_latest_work_is_newest_timestamp_not_deepest_branch() -> None:
    result = project_objective_stacks(
        _section10_gt(),
        _section10_git(),
        trunk_ref="refs/heads/main",
        cwd=Path("/repo"),
    )
    assert isinstance(result, ObjectiveStackProjection)
    alpha = next(g for g in result.objectives if g.slug == "alpha")
    assert alpha.latest_work == ObjectiveStackLatestWork(
        branch="feat/b",
        committed_iso="2026-05-20T12:00:00Z",
        oid="b-alpha",
    )


def test_p7_latest_work_tie_breaks_on_branch_then_oid() -> None:
    # Two branches touch alpha at the SAME timestamp; the lexicographically
    # smaller branch name wins.
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                _trunk_node("main", ("feat/x", "feat/y")),
                GtTrackedBranch(name="feat/x", parent="main", children=(), validation_result="OK"),
                GtTrackedBranch(name="feat/y", parent="main", children=(), validation_result="OK"),
            ),
            warnings=(),
        )
    )
    git = FakeGitGateway(
        branches=("main", "feat/x", "feat/y"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/x", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="x-oid",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/o.md",),
                ),
            ),
            ("main..feat/y", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="y-oid",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/o.md",),
                ),
            ),
        },
    )
    result = project_objective_stacks(gt, git, trunk_ref="refs/heads/main", cwd=Path("/repo"))
    assert isinstance(result, ObjectiveStackProjection)
    alpha = next(g for g in result.objectives if g.slug == "alpha")
    assert alpha.latest_work is not None
    assert alpha.latest_work.branch == "feat/x"


def test_p7_uninterpretable_timestamp_sorts_oldest() -> None:
    # feat/x has a garbage timestamp; feat/y has a real one. feat/y must win.
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                _trunk_node("main", ("feat/x", "feat/y")),
                GtTrackedBranch(name="feat/x", parent="main", children=(), validation_result="OK"),
                GtTrackedBranch(name="feat/y", parent="main", children=(), validation_result="OK"),
            ),
            warnings=(),
        )
    )
    git = FakeGitGateway(
        branches=("main", "feat/x", "feat/y"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/x", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="x-oid",
                    committed_iso="not-a-timestamp",
                    paths=(".asdl/objectives/alpha/o.md",),
                ),
            ),
            ("main..feat/y", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="y-oid",
                    committed_iso="2000-01-01T00:00:00Z",
                    paths=(".asdl/objectives/alpha/o.md",),
                ),
            ),
        },
    )
    result = project_objective_stacks(gt, git, trunk_ref="refs/heads/main", cwd=Path("/repo"))
    assert isinstance(result, ObjectiveStackProjection)
    alpha = next(g for g in result.objectives if g.slug == "alpha")
    assert alpha.latest_work is not None
    assert alpha.latest_work.branch == "feat/y"


# ---------------------------------------------------------------------------
# P8 — Ordering, determinism, warnings + section-10 capstone
# ---------------------------------------------------------------------------


# The expected projection encodes the blueprint §6.2 verbatim JSON (ground
# truth). The capstone asserts full structural equality against THIS value.
_EXPECTED_SECTION10 = ObjectiveStackProjection(
    trunk_branch="main",
    warnings=(),
    objectives=(
        ObjectiveStackGroup(
            slug="alpha",
            status="open",
            objective_branch_count=3,
            segment_count=2,
            latest_work=ObjectiveStackLatestWork(
                branch="feat/b",
                committed_iso="2026-05-20T12:00:00Z",
                oid="b-alpha",
            ),
            segments=(
                ObjectiveStackSegment(
                    index=1,
                    rows=(
                        ObjectiveStackRow(
                            branch="feat/a",
                            parent="main",
                            depth=0,
                            touches_objective=True,
                            connector=False,
                            also_touches=("beta",),
                            validation_result="OK",
                            needs_restack=False,
                        ),
                        ObjectiveStackRow(
                            branch="feat/connector",
                            parent="feat/a",
                            depth=1,
                            touches_objective=False,
                            connector=True,
                            also_touches=(),
                            validation_result="VALID",
                            needs_restack=True,
                        ),
                        ObjectiveStackRow(
                            branch="feat/c",
                            parent="feat/connector",
                            depth=2,
                            touches_objective=True,
                            connector=False,
                            also_touches=(),
                            validation_result=None,
                            needs_restack=False,
                        ),
                    ),
                ),
                ObjectiveStackSegment(
                    index=2,
                    rows=(
                        ObjectiveStackRow(
                            branch="feat/b",
                            parent="main",
                            depth=0,
                            touches_objective=True,
                            connector=False,
                            also_touches=(),
                            validation_result=None,
                            needs_restack=False,
                        ),
                    ),
                ),
            ),
        ),
        ObjectiveStackGroup(
            slug="beta",
            status="in-flight",
            objective_branch_count=1,
            segment_count=1,
            latest_work=ObjectiveStackLatestWork(
                branch="feat/a",
                committed_iso="2026-05-20T10:00:00Z",
                oid="a-multi",
            ),
            segments=(
                ObjectiveStackSegment(
                    index=1,
                    rows=(
                        ObjectiveStackRow(
                            branch="feat/a",
                            parent="main",
                            depth=0,
                            touches_objective=True,
                            connector=False,
                            also_touches=("alpha",),
                            validation_result="OK",
                            needs_restack=False,
                        ),
                    ),
                ),
            ),
        ),
    ),
)


def test_p8_capstone_full_projection_equality() -> None:
    result = project_objective_stacks(
        _section10_gt(),
        _section10_git(),
        trunk_ref="refs/heads/main",
        cwd=Path("/repo"),
    )
    assert result == _EXPECTED_SECTION10


def test_p8_objectives_ordered_alphabetically_by_slug() -> None:
    result = project_objective_stacks(
        _section10_gt(),
        _section10_git(),
        trunk_ref="refs/heads/main",
        cwd=Path("/repo"),
    )
    assert isinstance(result, ObjectiveStackProjection)
    assert [g.slug for g in result.objectives] == ["alpha", "beta"]


def test_p8_graph_warnings_pass_through_and_dedupe() -> None:
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                _trunk_node("main", ("feat/a",)),
                GtTrackedBranch(name="feat/a", parent="main", children=(), validation_result="OK"),
            ),
            warnings=("recorded child missing", "recorded child missing"),
        )
    )
    git = FakeGitGateway(
        branches=("main", "feat/a"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="a",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/o.md",),
                ),
            ),
        },
    )
    result = project_objective_stacks(gt, git, trunk_ref="refs/heads/main", cwd=Path("/repo"))
    assert isinstance(result, ObjectiveStackProjection)
    # De-duplicated: the duplicate graph warning appears once.
    assert result.warnings == ("recorded child missing",)


def test_p8_ancestor_walk_anomaly_references_missing_parent() -> None:
    # feat/c touches alpha but its parent feat/gone is missing from the graph
    # AND from the local set. feat/c is in scope only if locally present and
    # reachable; here we model a node whose parent is absent from the graph.
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                _trunk_node("main", ()),
                GtTrackedBranch(
                    name="feat/c",
                    parent="feat/gone",
                    children=(),
                    validation_result="OK",
                ),
            ),
            warnings=(),
        )
    )
    git = FakeGitGateway(
        branches=("main", "feat/c"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("feat/gone..feat/c", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="c",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/o.md",),
                ),
            ),
        },
    )
    result = project_objective_stacks(gt, git, trunk_ref="refs/heads/main", cwd=Path("/repo"))
    assert isinstance(result, ObjectiveStackProjection)
    # feat/c's parent feat/gone is missing -> feat/c is severed and skipped.
    assert any("feat/c" in w for w in result.warnings)
    assert result.objectives == ()


# ---------------------------------------------------------------------------
# P8 — No partial projection on failure + read-failure attribution (§8, §9 risk #7)
#
# These exercise the PUBLIC entry function's failure contract, not the private
# slice helper. The sentinel wrappers (_SliceReadFailure / _TrunkStatusReadFailure)
# are the load-bearing machinery that lets the operation layer later emit
# gt_slice_read_failed vs trunk_status_read_failed; their distinguishability must
# be asserted at the layer that defines them.
# ---------------------------------------------------------------------------


def test_p8_slice_read_failure_aborts_with_slice_sentinel() -> None:
    # A per-branch parent..branch slice read fails -> the entry function aborts
    # and returns a _SliceReadFailure (NOT a bare GitCommandFailure and NOT a
    # partial ObjectiveStackProjection).
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                _trunk_node("main", ("feat/a",)),
                GtTrackedBranch(name="feat/a", parent="main", children=(), validation_result="OK"),
            ),
            warnings=(),
        )
    )
    git = FakeGitGateway(
        branches=("main", "feat/a"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): GitCommandFailure(
                message="slice boom", returncode=128
            ),
        },
    )

    result = project_objective_stacks(gt, git, trunk_ref="refs/heads/main", cwd=Path("/repo"))

    assert isinstance(result, _SliceReadFailure)
    assert not isinstance(result, _TrunkStatusReadFailure)
    assert not isinstance(result, ObjectiveStackProjection)
    assert result.message == "slice boom"
    assert result.returncode == 128


def test_p8_trunk_status_read_failure_aborts_with_trunk_sentinel() -> None:
    # The single trunk Objective-status read fails AFTER slices succeed -> the
    # entry function aborts and returns a _TrunkStatusReadFailure, distinct from
    # the slice sentinel.
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                _trunk_node("main", ("feat/a",)),
                GtTrackedBranch(name="feat/a", parent="main", children=(), validation_result="OK"),
            ),
            warnings=(),
        )
    )
    git = FakeGitGateway(
        branches=("main", "feat/a"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="a",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/objective.md",),
                ),
            ),
        },
        tracked_paths_by_ref_path={
            ("refs/heads/main", ".asdl/objectives"): GitCommandFailure(
                message="trunk boom", returncode=129
            ),
        },
    )

    result = project_objective_stacks(gt, git, trunk_ref="refs/heads/main", cwd=Path("/repo"))

    assert isinstance(result, _TrunkStatusReadFailure)
    assert not isinstance(result, _SliceReadFailure)
    assert not isinstance(result, ObjectiveStackProjection)
    assert result.message == "trunk boom"
    assert result.returncode == 129


def test_p8_slice_and_trunk_sentinels_are_distinguishable() -> None:
    # The two read-failure sentinels are distinct types from each other and from
    # a bare GitCommandFailure, so the operation layer can attribute the failure
    # by WHICH read surfaced it.
    assert issubclass(_SliceReadFailure, GitCommandFailure)
    assert issubclass(_TrunkStatusReadFailure, GitCommandFailure)
    assert _SliceReadFailure is not _TrunkStatusReadFailure

    slice_failure = _SliceReadFailure(message="x", returncode=1)
    trunk_failure = _TrunkStatusReadFailure(message="x", returncode=1)
    bare = GitCommandFailure(message="x", returncode=1)

    # A slice failure is NOT a trunk failure and vice-versa.
    assert not isinstance(slice_failure, _TrunkStatusReadFailure)
    assert not isinstance(trunk_failure, _SliceReadFailure)
    # A bare GitCommandFailure is neither sentinel.
    assert not isinstance(bare, _SliceReadFailure)
    assert not isinstance(bare, _TrunkStatusReadFailure)


def test_p8_slice_failure_aborts_even_after_an_earlier_slice_succeeds() -> None:
    # No partial projection: feat/a's slice succeeds (touching alpha) but feat/b's
    # slice fails. The whole projection aborts with the slice sentinel; nothing of
    # the alpha work that was already assembled leaks out.
    gt = FakeGtGateway(
        branch_graph=GtBranchGraph(
            trunk="main",
            branches=(
                _trunk_node("main", ("feat/a", "feat/b")),
                GtTrackedBranch(name="feat/a", parent="main", children=(), validation_result="OK"),
                GtTrackedBranch(name="feat/b", parent="main", children=(), validation_result="OK"),
            ),
            warnings=(),
        )
    )
    git = FakeGitGateway(
        branches=("main", "feat/a", "feat/b"),
        trunk_branch="main",
        path_change_touches_by_ref_path={
            ("main..feat/a", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="a",
                    committed_iso="2026-05-20T10:00:00Z",
                    paths=(".asdl/objectives/alpha/objective.md",),
                ),
            ),
            ("main..feat/b", ".asdl/objectives"): GitCommandFailure(
                message="late slice boom", returncode=128
            ),
        },
    )

    result = project_objective_stacks(gt, git, trunk_ref="refs/heads/main", cwd=Path("/repo"))

    assert isinstance(result, _SliceReadFailure)
    assert not isinstance(result, ObjectiveStackProjection)
    assert result.message == "late slice boom"


def test_p8_branch_graph_failure_aborts_entry_function() -> None:
    # A GtCommandFailure from gt.branch_graph aborts the entry function and is
    # returned verbatim (the operation layer maps it to gt_branch_graph_failed).
    gt = FakeGtGateway(
        branch_graph=GtCommandFailure(message="graph boom", returncode=2),
    )
    git = FakeGitGateway(branches=("main",), trunk_branch="main")

    result = project_objective_stacks(gt, git, trunk_ref="refs/heads/main", cwd=Path("/repo"))

    assert isinstance(result, GtCommandFailure)
    assert not isinstance(result, GitCommandFailure)
    assert not isinstance(result, ObjectiveStackProjection)
    assert result.message == "graph boom"
    assert result.returncode == 2
