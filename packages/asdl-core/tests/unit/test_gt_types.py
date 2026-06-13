from __future__ import annotations

import pytest

from asdl_core.gt.types import (
    EMPTY_BRANCH_NAME_WARNING,
    ChildrenCorruption,
    DescendantWalk,
    StackFork,
    StackInfo,
    TrunkMarkerProblem,
    WalkCycle,
    WalkRowMissing,
    render_ancestor_termination,
    render_children_corruption,
    render_descendant_termination,
    render_stack_fork,
    render_trunk_marker_problem,
)


@pytest.mark.parametrize(
    ("termination", "expected"),
    [
        (
            WalkCycle("feat/a"),
            "cycle detected in Graphite parent metadata at feat/a; ancestor walk stopped",
        ),
        (
            WalkRowMissing("feat/missing"),
            "parent branch feat/missing is missing from Graphite metadata; ancestor walk stopped",
        ),
    ],
)
def test_render_ancestor_termination_matches_legacy_warning_strings(
    termination: WalkCycle | WalkRowMissing,
    expected: str,
) -> None:
    assert render_ancestor_termination(termination) == expected


@pytest.mark.parametrize(
    ("termination", "expected"),
    [
        (
            WalkCycle("feat/a"),
            "cycle detected in Graphite children metadata at feat/a; descendant walk stopped",
        ),
        (
            WalkRowMissing("feat/missing"),
            "child branch feat/missing is missing from Graphite metadata; descendant walk stopped",
        ),
    ],
)
def test_render_descendant_termination_matches_legacy_warning_strings(
    termination: WalkCycle | WalkRowMissing,
    expected: str,
) -> None:
    assert render_descendant_termination(termination) == expected


@pytest.mark.parametrize(
    ("fork", "expected"),
    [
        (
            StackFork(branch="feat/current", children=("feat/a", "feat/b")),
            "branch feat/current has 2 Graphite children; descendants follow the first child only",
        ),
    ],
)
def test_render_stack_fork_matches_legacy_warning_strings(
    fork: StackFork,
    expected: str,
) -> None:
    assert render_stack_fork(fork) == expected


@pytest.mark.parametrize(
    ("corruption", "expected"),
    [
        (
            ChildrenCorruption(branch="feat/current", kind="not_text"),
            "children metadata for feat/current is not JSON text; treating as no children",
        ),
        (
            ChildrenCorruption(branch="feat/current", kind="invalid_json"),
            "children metadata for feat/current is not valid JSON; treating as no children",
        ),
        (
            ChildrenCorruption(branch="feat/current", kind="not_list"),
            "children metadata for feat/current is not a JSON list; treating as no children",
        ),
        (
            ChildrenCorruption(branch="feat/current", kind="non_string"),
            "children metadata for feat/current contains non-string entries",
        ),
    ],
)
def test_render_children_corruption_matches_legacy_warning_strings(
    corruption: ChildrenCorruption,
    expected: str,
) -> None:
    assert render_children_corruption(corruption) == expected


@pytest.mark.parametrize(
    ("problem", "expected"),
    [
        (
            TrunkMarkerProblem(
                terminus="main",
                terminus_state="row_missing",
                marked_trunks=("other", "feat/current"),
            ),
            ("trunk row marker missing",),
        ),
        (
            TrunkMarkerProblem(
                terminus="main",
                terminus_state="unmarked",
                marked_trunks=(),
            ),
            ("trunk row marker missing",),
        ),
        (
            TrunkMarkerProblem(
                terminus="main",
                terminus_state="marked",
                marked_trunks=("main", "other"),
            ),
            ("multiple Graphite metadata rows are marked as trunk",),
        ),
        (
            TrunkMarkerProblem(
                terminus="main",
                terminus_state="marked",
                marked_trunks=("other",),
            ),
            ("Graphite metadata trunk marker differs from ancestor-walk terminus: other != main",),
        ),
        (
            TrunkMarkerProblem(
                terminus="main",
                terminus_state="unmarked",
                marked_trunks=("other", "feat/current"),
            ),
            (
                "trunk row marker missing",
                "multiple Graphite metadata rows are marked as trunk",
                "Graphite metadata trunk marker differs from ancestor-walk terminus: other != main",
            ),
        ),
    ],
)
def test_render_trunk_marker_problem_matches_legacy_warning_strings(
    problem: TrunkMarkerProblem,
    expected: tuple[str, ...],
) -> None:
    assert render_trunk_marker_problem(problem) == expected


def test_stack_info_rejects_empty_current() -> None:
    with pytest.raises(ValueError, match="StackInfo.current must name"):
        StackInfo(
            trunk="main",
            current="",
            ancestors=(),
            children=(),
        )


def test_stack_info_render_warnings_composes_integrity_model_in_legacy_order() -> None:
    stack = StackInfo(
        trunk="main",
        current="feat/current",
        ancestors=("main",),
        children=("feat/a", "feat/b"),
        ancestor_termination=WalkRowMissing("main"),
        descendant_walk=DescendantWalk(
            forks=(StackFork(branch="feat/current", children=("feat/a", "feat/b")),),
            children_corruptions=(ChildrenCorruption(branch="feat/current", kind="non_string"),),
            termination=WalkCycle("feat/current"),
        ),
        trunk_marker=TrunkMarkerProblem(
            terminus="main",
            terminus_state="unmarked",
            marked_trunks=("other",),
        ),
        unwalked_children_corruptions=(ChildrenCorruption(branch="other", kind="invalid_json"),),
        empty_branch_name_rows=1,
    )

    assert stack.render_warnings() == (
        EMPTY_BRANCH_NAME_WARNING,
        "children metadata for other is not valid JSON; treating as no children",
        "children metadata for feat/current contains non-string entries",
        "parent branch main is missing from Graphite metadata; ancestor walk stopped",
        "branch feat/current has 2 Graphite children; descendants follow the first child only",
        "cycle detected in Graphite children metadata at feat/current; descendant walk stopped",
        "trunk row marker missing",
        "Graphite metadata trunk marker differs from ancestor-walk terminus: other != main",
    )


def test_descendant_walk_is_clean_only_without_integrity_findings() -> None:
    assert DescendantWalk().is_clean
    assert not DescendantWalk(
        forks=(StackFork(branch="feat/current", children=("a", "b")),)
    ).is_clean
    assert not DescendantWalk(
        children_corruptions=(ChildrenCorruption(branch="feat/current", kind="not_list"),)
    ).is_clean
    assert not DescendantWalk(termination=WalkCycle("feat/current")).is_clean
