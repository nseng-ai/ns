from __future__ import annotations

from twerk_core.gh.types import PRFile
from twerk_reviewer.cli.reviewer.exec.format_findings_comment import FindingRow
from twerk_reviewer.cli.reviewer.exec.post_inline_review import (
    build_diff_index,
    filter_findings,
    render_finding_inline,
    targetable_lines,
)

# -- targetable_lines -------------------------------------------------------


def test_targetable_lines_includes_added_and_context_lines() -> None:
    # Hunk: 4 lines starting at 10 in the old file, 6 lines starting at 12 in
    # the new file — two additions sandwiched between two contexts on each
    # side. All six new-file lines (12–17) are targetable.
    patch = "@@ -10,4 +12,6 @@ def foo():\n ctx1\n ctx2\n+added1\n+added2\n ctx3\n ctx4\n"
    assert targetable_lines(patch) == {12, 13, 14, 15, 16, 17}


def test_targetable_lines_skips_deletions() -> None:
    # A deletion exists only on the old side; it must not advance the
    # new-file line counter, so the lines after the "-" still map to the
    # correct new-file position.
    patch = "@@ -10,3 +12,2 @@ def foo():\n ctx1\n-removed\n ctx2\n"
    assert targetable_lines(patch) == {12, 13}


def test_targetable_lines_handles_multiple_hunks() -> None:
    patch = (
        "@@ -10,2 +10,2 @@ head1\n"
        " ctx10\n"
        " ctx11\n"
        "@@ -30,2 +34,3 @@ head2\n"
        " ctx34\n"
        "+added35\n"
        " ctx36\n"
    )
    assert targetable_lines(patch) == {10, 11, 34, 35, 36}


def test_targetable_lines_treats_single_line_hunk_without_size() -> None:
    # GitHub omits the trailing `,size` when size == 1. Parser must still
    # extract the starting line number and mark it targetable.
    patch = "@@ -42 +42 @@ single_line_replace\n-old\n+new\n"
    assert targetable_lines(patch) == {42}


def test_targetable_lines_empty_patch() -> None:
    assert targetable_lines("") == set()


def test_targetable_lines_none_patch() -> None:
    # Files with no patch (large binaries, renames without content changes)
    # must return an empty set rather than crash.
    assert targetable_lines(None) == set()


def test_targetable_lines_ignores_no_newline_marker() -> None:
    patch = "@@ -1,2 +1,2 @@\n ctx1\n+added\n\\ No newline at end of file\n"
    assert targetable_lines(patch) == {1, 2}


# -- build_diff_index -------------------------------------------------------


def test_build_diff_index_maps_each_file_to_its_lines() -> None:
    files = (
        PRFile(path="a.py", patch="@@ -1 +1 @@\n ctx1\n"),
        PRFile(path="b.py", patch="@@ -10,1 +20,2 @@\n ctx20\n+added21\n"),
        PRFile(path="c.py", patch=None),
    )
    assert build_diff_index(files) == {
        "a.py": frozenset({1}),
        "b.py": frozenset({20, 21}),
        "c.py": frozenset(),
    }


# -- filter_findings --------------------------------------------------------


def _finding(**overrides: object) -> FindingRow:
    base: dict[str, object] = {
        "path": "app.py",
        "line": 10,
        "severity": "warning",
        "summary": "x",
        "details": "y",
    }
    base.update(overrides)
    return FindingRow(**base)  # type: ignore[arg-type]


def test_filter_findings_partitions_by_reason() -> None:
    diff_index = {"app.py": frozenset({10, 11, 12})}
    findings = (
        _finding(line=10),
        _finding(line=999),
        _finding(line=None),
        _finding(path="other.py", line=10),
    )

    decision = filter_findings(findings, diff_index)

    assert [(c.path, c.line) for c in decision.inline] == [("app.py", 10)]
    assert [f.line for f in decision.skipped_no_line] == [None]
    assert [(f.path, f.line) for f in decision.skipped_out_of_diff] == [
        ("app.py", 999),
        ("other.py", 10),
    ]


def test_filter_findings_renders_inline_body_with_severity_label() -> None:
    diff_index = {"app.py": frozenset({10})}
    finding = _finding(line=10, severity="error", summary="Nope", details="because.")

    decision = filter_findings((finding,), diff_index)

    assert decision.inline[0].body == render_finding_inline(finding)
    assert decision.inline[0].body.startswith("**⛔ error — Nope**")
    assert "because." in decision.inline[0].body
