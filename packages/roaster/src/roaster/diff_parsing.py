"""Parse unified diffs into per-file review units."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Literal

DiffChangeKind = Literal["added", "modified", "deleted", "renamed", "copied"]

_HUNK_HEADER_RE = re.compile(r"^@@ -\d+(?:,\d+)? \+(?P<start>\d+)(?:,\d+)? @@")


@dataclass(frozen=True)
class DiffFile:
    """One file's slice of a unified diff, with size metrics."""

    path: str
    old_path: str | None
    change_kind: DiffChangeKind
    raw_text: str
    is_binary: bool
    added_lines: int
    removed_lines: int
    hunk_count: int
    byte_size: int
    estimated_tokens: int


_ESCAPED_BYTES: dict[str, int] = {
    "a": 7,
    "b": 8,
    "t": 9,
    "n": 10,
    "v": 11,
    "f": 12,
    "r": 13,
    "\\": 92,
    '"': 34,
}


def estimate_tokens(text: str) -> int:
    """Return a conservative token estimate for diff-budget sizing."""
    if not text:
        return 0
    return math.ceil(len(text) / 4)


def parse_unified_diff(diff_text: str) -> tuple[DiffFile, ...]:
    """Split a unified diff into per-file units with size metrics."""
    if not diff_text.strip():
        return ()

    return tuple(_parse_segment(segment) for segment in _diff_segments(diff_text))


def _diff_segments(diff_text: str) -> tuple[str, ...]:
    lines = diff_text.splitlines(keepends=True)
    segments: list[str] = []
    current_lines: list[str] = []

    for line in lines:
        if line.startswith("diff --git ") and current_lines:
            segments.append("".join(current_lines))
            current_lines = []
        current_lines.append(line)

    if current_lines:
        segments.append("".join(current_lines))

    return tuple(segments)


def _parse_segment(raw_text: str) -> DiffFile:
    lines = raw_text.splitlines()
    old_path, new_path = _paths_from_patch_headers(lines)
    if old_path is None and new_path is None:
        old_path, new_path = _paths_from_diff_header(lines)

    change_kind = _change_kind(lines)
    rename_from = _metadata_value(lines, "rename from ")
    rename_to = _metadata_value(lines, "rename to ")
    copy_from = _metadata_value(lines, "copy from ")
    copy_to = _metadata_value(lines, "copy to ")

    if rename_to is not None:
        new_path = rename_to
    if rename_from is not None:
        old_path = rename_from
    if copy_to is not None:
        new_path = copy_to
    if copy_from is not None:
        old_path = copy_from

    if new_path is None:
        new_path = old_path or ""
    if change_kind not in {"renamed", "copied"}:
        old_path = None

    is_binary = any(line.startswith("Binary files ") and line.endswith(" differ") for line in lines)
    added_lines, removed_lines, hunk_count = _hunk_metrics(lines, is_binary=is_binary)

    return DiffFile(
        path=new_path,
        old_path=old_path,
        change_kind=change_kind,
        raw_text=raw_text,
        is_binary=is_binary,
        added_lines=added_lines,
        removed_lines=removed_lines,
        hunk_count=hunk_count,
        byte_size=len(raw_text.encode("utf-8")),
        estimated_tokens=estimate_tokens(raw_text),
    )


def _change_kind(lines: list[str]) -> DiffChangeKind:
    has_rename = False
    has_copy = False
    for line in lines:
        if line.startswith("new file mode "):
            return "added"
        if line.startswith("deleted file mode "):
            return "deleted"
        if line.startswith("rename from ") or line.startswith("rename to "):
            has_rename = True
        if line.startswith("copy from ") or line.startswith("copy to "):
            has_copy = True

    if has_rename:
        return "renamed"
    if has_copy:
        return "copied"
    return "modified"


def _paths_from_patch_headers(lines: list[str]) -> tuple[str | None, str | None]:
    old_path: str | None = None
    new_path: str | None = None
    for line in lines:
        if line.startswith("--- "):
            old_path = _normalize_prefixed_path(_decode_path_field(line.removeprefix("--- ")))
        elif line.startswith("+++ "):
            new_path = _normalize_prefixed_path(_decode_path_field(line.removeprefix("+++ ")))
        if old_path is not None and new_path is not None:
            break

    if old_path == "/dev/null":
        old_path = None
    if new_path == "/dev/null":
        new_path = None
    return old_path, new_path


def _paths_from_diff_header(lines: list[str]) -> tuple[str | None, str | None]:
    if not lines:
        return None, None
    first_line = lines[0]
    if not first_line.startswith("diff --git "):
        return None, None

    tokens = _path_tokens(first_line.removeprefix("diff --git "))
    if len(tokens) < 2:
        return None, None
    return _normalize_prefixed_path(tokens[0]), _normalize_prefixed_path(tokens[1])


def _metadata_value(lines: list[str], prefix: str) -> str | None:
    for line in lines:
        if line.startswith(prefix):
            return _decode_path_field(line.removeprefix(prefix))
    return None


def _hunk_metrics(lines: list[str], *, is_binary: bool) -> tuple[int, int, int]:
    if is_binary:
        return 0, 0, 0

    added_lines = 0
    removed_lines = 0
    hunk_count = 0
    in_hunk = False

    for line in lines:
        if _HUNK_HEADER_RE.match(line) is not None:
            hunk_count += 1
            in_hunk = True
            continue
        if not in_hunk:
            continue
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+"):
            added_lines += 1
        elif line.startswith("-"):
            removed_lines += 1

    return added_lines, removed_lines, hunk_count


def _normalize_prefixed_path(path: str | None) -> str | None:
    if path is None or path == "/dev/null":
        return path
    if path.startswith("a/") or path.startswith("b/"):
        return path[2:]
    return path


def _decode_path_field(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        return ""
    token = _path_tokens(stripped)
    if token:
        return token[0]
    return _decode_git_quoted_path(stripped)


def _path_tokens(value: str) -> list[str]:
    tokens: list[str] = []
    index = 0
    while index < len(value):
        while index < len(value) and value[index].isspace():
            index += 1
        if index >= len(value):
            break
        if value[index] == '"':
            token, index = _read_quoted_token(value, index)
            tokens.append(_decode_git_quoted_path(token))
            continue

        start = index
        while index < len(value) and not value[index].isspace():
            index += 1
        tokens.append(value[start:index])
    return tokens


def _read_quoted_token(value: str, start: int) -> tuple[str, int]:
    index = start + 1
    escaped = False
    while index < len(value):
        char = value[index]
        if escaped:
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == '"':
            return value[start : index + 1], index + 1
        index += 1
    return value[start:], len(value)


def _decode_git_quoted_path(value: str) -> str:
    if len(value) < 2 or not value.startswith('"') or not value.endswith('"'):
        return value

    inner = value[1:-1]
    output = bytearray()
    index = 0
    while index < len(inner):
        char = inner[index]
        if char != "\\":
            output.extend(char.encode("utf-8"))
            index += 1
            continue

        if index + 1 >= len(inner):
            output.append(ord("\\"))
            index += 1
            continue

        escaped = inner[index + 1]
        if escaped in _ESCAPED_BYTES:
            output.append(_ESCAPED_BYTES[escaped])
            index += 2
            continue
        if escaped in "01234567":
            end = index + 1
            while end < len(inner) and end < index + 4 and inner[end] in "01234567":
                end += 1
            octal_value = int(inner[index + 1 : end], 8)
            if octal_value <= 255:
                output.append(octal_value)
            index = end
            continue

        output.extend(escaped.encode("utf-8"))
        index += 2

    return output.decode("utf-8", errors="replace")
