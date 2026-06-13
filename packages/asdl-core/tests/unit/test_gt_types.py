from __future__ import annotations

import pytest

from asdl_core.gt.types import (
    EMPTY_BRANCH_NAME_WARNING,
    ChildrenCorruption,
    DescendantWalk,
    StackFork,
    StackInfo,
    StackWalkDiagnostic,
    TrunkMarkerProblem,
    WalkCycle,
    WalkRowMissing,
    render_ancestor_termination,
    render_children_corruption,
    render_descendant_termination,
    render_stack_fork,
    render_stack_walk_warning,
    render_trunk_marker_problem,
)


@pytest.mark.parametrize(
    ("diagnostic", "expected"),
    [
        (
            StackWalkDiagnostic(
                scope="descendant",
                kind="fork",
                branch="feat/current",
                children=("feat/a", "feat/b"),
            ),
            "branch feat/current has 2 Graphite children; descendants follow the first child only",
        ),
        (
            StackWalkDiagnostic(scope="ancestor", kind="cycle", branch="feat/a"),
            "cycle detected in Graphite parent metadata at feat/a; ancestor walk stopped",
        ),
        (
            StackWalkDiagnostic(scope="descendant", kind="cycle", branch="feat/a"),
            "cycle detected in Graphite children metadata at feat/a; descendant walk stopped",
        ),
        (
            StackWalkDiagnostic(scope="ancestor", kind="missing_row", branch="feat/missing"),
            "parent branch feat/missing is missing from Graphite metadata; ancestor walk stopped",
        ),
        (
            StackWalkDiagnostic(scope="descendant", kind="missing_row", branch="feat/missing"),
            "child branch feat/missing is missing from Graphite metadata; descendant walk stopped",
        ),
        (
            StackWalkDiagnostic(scope="trunk_marker", kind="marker_missing", branch="main"),
            "trunk row marker missing",
        ),
        (
            StackWalkDiagnostic(
                scope="trunk_marker",
                kind="marker_multiple",
                branch="main",
                children=("other", "feat/current"),
            ),
            "multiple Graphite metadata rows are marked as trunk",
        ),
        (
            StackWalkDiagnostic(
                scope="trunk_marker",
                kind="marker_mismatch",
                branch="main",
                children=("other", "feat/current"),
            ),
            "Graphite metadata trunk marker differs from ancestor-walk terminus: other != main",
        ),
        (
            StackWalkDiagnostic(scope="load", kind="children_not_text", branch="feat/current"),
            "children metadata for feat/current is not JSON text; treating as no children",
        ),
        (
            StackWalkDiagnostic(
                scope="load",
                kind="children_invalid_json",
                branch="feat/current",
            ),
            "children metadata for feat/current is not valid JSON; treating as no children",
        ),
        (
            StackWalkDiagnostic(scope="load", kind="children_not_list", branch="feat/current"),
            "children metadata for feat/current is not a JSON list; treating as no children",
        ),
        (
            StackWalkDiagnostic(
                scope="load",
                kind="children_non_string",
                branch="feat/current",
            ),
            "children metadata for feat/current contains non-string entries",
        ),
        (
            StackWalkDiagnostic(scope="load", kind="empty_branch_name", branch=None),
            "Graphite metadata row has an empty branch_name; row ignored",
        ),
    ],
)
def test_render_stack_walk_warning_matches_legacy_warning_strings(
    diagnostic: StackWalkDiagnostic,
    expected: str,
) -> None:
    assert render_stack_walk_warning(diagnostic) == expected


def test_stack_info_rejects_empty_current() -> None:
    with pytest.raises(ValueError, match="StackInfo.current must name"):
        StackInfo(
            trunk="main",
            current="",
            ancestors=(),
            children=(),
            warnings=(),
        )


def test_stack_info_defaults_empty_diagnostics() -> None:
    stack = StackInfo(
        trunk="main",
        current="feat/current",
        ancestors=("main",),
        children=(),
        warnings=(),
    )

    assert stack.diagnostics == ()


def test_render_helpers_match_legacy_warning_strings() -> None:
    assert (
        render_ancestor_termination(WalkCycle("feat/a"))
        == "cycle detected in Graphite parent metadata at feat/a; ancestor walk stopped"
    )
    assert (
        render_ancestor_termination(WalkRowMissing("feat/missing"))
        == "parent branch feat/missing is missing from Graphite metadata; ancestor walk stopped"
    )
    assert (
        render_descendant_termination(WalkCycle("feat/a"))
        == "cycle detected in Graphite children metadata at feat/a; descendant walk stopped"
    )
    assert (
        render_descendant_termination(WalkRowMissing("feat/missing"))
        == "child branch feat/missing is missing from Graphite metadata; descendant walk stopped"
    )
    assert (
        render_stack_fork(StackFork(branch="feat/current", children=("feat/a", "feat/b")))
        == "branch feat/current has 2 Graphite children; descendants follow the first child only"
    )
    assert (
        render_children_corruption(ChildrenCorruption(branch="feat/current", kind="not_text"))
        == "children metadata for feat/current is not JSON text; treating as no children"
    )
    assert render_trunk_marker_problem(
        TrunkMarkerProblem(
            terminus="main",
            terminus_state="unmarked",
            marked_trunks=("other", "feat/current"),
        )
    ) == (
        "trunk row marker missing",
        "multiple Graphite metadata rows are marked as trunk",
        "Graphite metadata trunk marker differs from ancestor-walk terminus: other != main",
    )
    assert render_trunk_marker_problem(
        TrunkMarkerProblem(
            terminus="missing",
            terminus_state="row_missing",
            marked_trunks=("other", "feat/current"),
        )
    ) == ("trunk row marker missing",)


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
