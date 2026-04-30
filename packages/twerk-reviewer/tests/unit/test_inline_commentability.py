from __future__ import annotations

import pytest

from twerk_core.gh.types import PRChangedFile
from twerk_reviewer.cli.reviewer.exec.format_findings_comment import FindingRow
from twerk_reviewer.inline_commentability import (
    classify_inline_findings,
    commentable_right_side_lines,
)

_PATCH = """@@ -10,4 +10,5 @@ def main():
 context
-old
+new
 tail
@@ -30,2 +31,3 @@ def other():
 keep
+added
"""


def _finding(path: str, line: int | None) -> FindingRow:
    return FindingRow(
        path=path,
        line=line,
        severity="warning",
        summary="summary",
        details="details",
    )


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        (11, True),  # added line
        (10, True),  # context line
        (12, True),  # context after deletion/addition
        (32, True),  # second hunk added line
        (30, False),  # deleted line is left-side-only
        (99, False),
    ],
)
def test_commentable_right_side_lines_handles_hunks(line: int, expected: bool) -> None:
    assert (line in commentable_right_side_lines(_PATCH)) is expected


def test_commentable_right_side_lines_missing_patch_is_empty() -> None:
    assert commentable_right_side_lines(None) == frozenset()


def test_classify_inline_findings_returns_inlineable_target() -> None:
    result = classify_inline_findings(
        (_finding("app.py", 11),),
        (PRChangedFile(path="app.py", status="modified", patch=_PATCH),),
    )

    assert len(result.inlineable) == 1
    assert result.inlineable[0].target.path == "app.py"
    assert result.inlineable[0].target.line == 11
    assert result.fallback_only == ()


@pytest.mark.parametrize(
    ("finding", "changed_files", "reason"),
    [
        (
            _finding("app.py", None),
            (PRChangedFile("app.py", "modified", _PATCH),),
            "missing_line",
        ),
        (
            _finding("other.py", 11),
            (PRChangedFile("app.py", "modified", _PATCH),),
            "file_not_changed",
        ),
        (
            _finding("app.py", 11),
            (PRChangedFile("app.py", "modified", None),),
            "patch_unavailable",
        ),
        (
            _finding("app.py", 99),
            (PRChangedFile("app.py", "modified", _PATCH),),
            "line_not_in_diff",
        ),
    ],
)
def test_classify_inline_findings_fallback_reasons(
    finding: FindingRow,
    changed_files: tuple[PRChangedFile, ...],
    reason: str,
) -> None:
    result = classify_inline_findings((finding,), changed_files)

    assert result.inlineable == ()
    assert len(result.fallback_only) == 1
    assert result.fallback_only[0].reason == reason
