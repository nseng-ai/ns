from __future__ import annotations

import math

import pytest

from roaster.diff_parsing import estimate_tokens, parse_unified_diff

MODIFY_DIFF = (
    "diff --git a/app.py b/app.py\n"
    "index 1111111..2222222 100644\n"
    "--- a/app.py\n"
    "+++ b/app.py\n"
    "@@ -1,2 +1,3 @@\n"
    " import os\n"
    "-print('old')\n"
    "+print('new')\n"
    "+print('extra')\n"
)

ADD_DIFF = (
    "diff --git a/new.py b/new.py\n"
    "new file mode 100644\n"
    "index 0000000..1111111\n"
    "--- /dev/null\n"
    "+++ b/new.py\n"
    "@@ -0,0 +1,2 @@\n"
    "+one\n"
    "+two\n"
)

DELETE_DIFF = (
    "diff --git a/old.py b/old.py\n"
    "deleted file mode 100644\n"
    "index 1111111..0000000\n"
    "--- a/old.py\n"
    "+++ /dev/null\n"
    "@@ -1,2 +0,0 @@\n"
    "-one\n"
    "-two\n"
)

PURE_RENAME_DIFF = (
    "diff --git a/old_name.py b/new_name.py\n"
    "similarity index 100%\n"
    "rename from old_name.py\n"
    "rename to new_name.py\n"
)

RENAME_WITH_CONTENT_DIFF = (
    "diff --git a/old_name.py b/new_name.py\n"
    "similarity index 88%\n"
    "rename from old_name.py\n"
    "rename to new_name.py\n"
    "index 1111111..2222222 100644\n"
    "--- a/old_name.py\n"
    "+++ b/new_name.py\n"
    "@@ -1 +1,2 @@\n"
    "-old\n"
    "+new\n"
    "+extra\n"
)

COPY_DIFF = (
    "diff --git a/template.py b/generated.py\n"
    "similarity index 100%\n"
    "copy from template.py\n"
    "copy to generated.py\n"
)

BINARY_DIFF = (
    "diff --git a/image.png b/image.png\n"
    "new file mode 100644\n"
    "index 0000000..1111111\n"
    "Binary files /dev/null and b/image.png differ\n"
)

QUOTED_PATH_DIFF = (
    'diff --git "a/spaced/\\303\\251 file.txt" "b/spaced/\\303\\251 file.txt"\n'
    '--- "a/spaced/\\303\\251 file.txt"\n'
    '+++ "b/spaced/\\303\\251 file.txt"\n'
    "@@ -1 +1 @@\n"
    "-old\n"
    "+new\n"
)


@pytest.mark.parametrize(
    (
        "diff_text",
        "change_kind",
        "path",
        "old_path",
        "is_binary",
        "added_lines",
        "removed_lines",
        "hunk_count",
    ),
    [
        (MODIFY_DIFF, "modified", "app.py", None, False, 2, 1, 1),
        (ADD_DIFF, "added", "new.py", None, False, 2, 0, 1),
        (DELETE_DIFF, "deleted", "old.py", None, False, 0, 2, 1),
        (PURE_RENAME_DIFF, "renamed", "new_name.py", "old_name.py", False, 0, 0, 0),
        (RENAME_WITH_CONTENT_DIFF, "renamed", "new_name.py", "old_name.py", False, 2, 1, 1),
        (COPY_DIFF, "copied", "generated.py", "template.py", False, 0, 0, 0),
        (BINARY_DIFF, "added", "image.png", None, True, 0, 0, 0),
        (QUOTED_PATH_DIFF, "modified", "spaced/é file.txt", None, False, 1, 1, 1),
    ],
)
def test_parse_unified_diff_file_metadata_and_metrics(
    diff_text: str,
    change_kind: str,
    path: str,
    old_path: str | None,
    is_binary: bool,
    added_lines: int,
    removed_lines: int,
    hunk_count: int,
) -> None:
    files = parse_unified_diff(diff_text)

    assert len(files) == 1
    file = files[0]
    assert file.change_kind == change_kind
    assert file.path == path
    assert file.old_path == old_path
    assert file.raw_text == diff_text
    assert file.is_binary is is_binary
    assert file.added_lines == added_lines
    assert file.removed_lines == removed_lines
    assert file.hunk_count == hunk_count
    assert file.byte_size == len(diff_text.encode("utf-8"))
    assert file.estimated_tokens == estimate_tokens(diff_text)


def test_parse_unified_diff_handles_multiple_files() -> None:
    diff_text = MODIFY_DIFF + DELETE_DIFF + PURE_RENAME_DIFF

    files = parse_unified_diff(diff_text)

    assert tuple(file.path for file in files) == ("app.py", "old.py", "new_name.py")
    assert tuple(file.change_kind for file in files) == ("modified", "deleted", "renamed")


def test_parse_unified_diff_round_trips_raw_text() -> None:
    diff_text = MODIFY_DIFF + ADD_DIFF + DELETE_DIFF + PURE_RENAME_DIFF + BINARY_DIFF

    files = parse_unified_diff(diff_text)

    assert "".join(file.raw_text for file in files) == diff_text


@pytest.mark.parametrize("diff_text", ["", "\n", "  \n\t"])
def test_parse_unified_diff_empty_or_whitespace_returns_no_files(diff_text: str) -> None:
    assert parse_unified_diff(diff_text) == ()


def test_parse_unified_diff_degrades_unexpected_segments_without_raising() -> None:
    files = parse_unified_diff("not a git diff\n+but still text\n")

    assert len(files) == 1
    assert files[0].change_kind == "modified"
    assert files[0].path == ""
    assert files[0].added_lines == 0
    assert files[0].removed_lines == 0


def test_estimate_tokens_uses_ceil_len_divided_by_four() -> None:
    assert estimate_tokens("") == 0
    assert estimate_tokens("a") == 1
    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("abcde") == 2
    assert estimate_tokens("x" * 41) == math.ceil(41 / 4)


def test_estimate_tokens_is_monotonic() -> None:
    texts = ["", "a", "abcd", "abcde", "abcdefghi"]

    estimates = [estimate_tokens(text) for text in texts]

    assert estimates == sorted(estimates)
