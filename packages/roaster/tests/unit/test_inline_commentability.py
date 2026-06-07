from __future__ import annotations

import pytest

from asdl_core.gh.types import PRChangedFile
from roaster.inline_commentability import (
    classify_inline_findings,
    commentable_right_side_lines,
)
from roaster.models import ReviewFinding

_PATCH = """@@ -10,4 +10,5 @@ def main():
 context
-old
+new
 tail
@@ -30,2 +31,3 @@ def other():
 keep
+added
"""


def _finding(path: str, line: int | None) -> ReviewFinding:
    return ReviewFinding.diff_line(
        path=path,
        line=line,
        severity="warning",
        summary="summary",
        details="details",
    )


def test_commentable_right_side_lines_includes_added_and_context_lines() -> None:
    patch = """@@ -10,3 +20,4 @@ def main():
 context before
-old
+new
 context after
"""

    assert commentable_right_side_lines(patch) == frozenset({20, 21, 22})


def test_commentable_right_side_lines_excludes_deleted_lines_without_advancing_right_side() -> None:
    patch = """@@ -10,5 +30,3 @@ def main():
 context before
-deleted one
-deleted two
 context after
+added after deletions
"""

    assert commentable_right_side_lines(patch) == frozenset({30, 31, 32})


def test_commentable_right_side_lines_handles_new_file_hunk_starting_at_one() -> None:
    patch = """@@ -0,0 +1,3 @@
+first
+second
+third
"""

    assert commentable_right_side_lines(patch) == frozenset({1, 2, 3})


def test_commentable_right_side_lines_deleted_file_has_no_right_side_lines() -> None:
    patch = """@@ -1,3 +0,0 @@
-first
-second
-third
"""

    assert commentable_right_side_lines(patch) == frozenset()


def test_commentable_right_side_lines_handles_single_line_hunk_header_without_counts() -> None:
    patch = """@@ -7 +8 @@
-old
+new
"""

    assert commentable_right_side_lines(patch) == frozenset({8})


def test_commentable_right_side_lines_handles_multiple_hunks_exactly() -> None:
    assert commentable_right_side_lines(_PATCH) == frozenset({10, 11, 12, 31, 32})


def test_commentable_right_side_lines_ignores_no_newline_marker() -> None:
    patch = """@@ -1 +1 @@
-old
\\ No newline at end of file
+new
\\ No newline at end of file
"""

    assert commentable_right_side_lines(patch) == frozenset({1})


def test_commentable_right_side_lines_ignores_text_before_first_hunk() -> None:
    patch = """diff --git a/app.py b/app.py
index 111..222 100644
--- a/app.py
+++ b/app.py
+not actually a hunk line
@@ -4,1 +4,2 @@
 context
+added
"""

    assert commentable_right_side_lines(patch) == frozenset({4, 5})


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


def test_classify_inline_findings_treats_document_global_finding_as_missing_path() -> None:
    finding = ReviewFinding.global_finding(
        severity="warning",
        summary="summary",
        details="details",
    )

    result = classify_inline_findings(
        (finding,),
        (PRChangedFile(path="app.py", status="modified", patch=_PATCH),),
    )

    assert result.inlineable == ()
    assert len(result.fallback_only) == 1
    assert result.fallback_only[0].reason == "missing_path"


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
    finding: ReviewFinding,
    changed_files: tuple[PRChangedFile, ...],
    reason: str,
) -> None:
    result = classify_inline_findings((finding,), changed_files)

    assert result.inlineable == ()
    assert len(result.fallback_only) == 1
    assert result.fallback_only[0].reason == reason
