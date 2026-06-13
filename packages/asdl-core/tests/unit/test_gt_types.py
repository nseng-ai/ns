from __future__ import annotations

import pytest

from asdl_core.gt.types import (
    StackInfo,
    StackWalkDiagnostic,
    render_stack_walk_warning,
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
