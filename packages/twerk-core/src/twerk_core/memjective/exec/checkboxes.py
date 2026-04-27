"""Pure helpers for parsing GitHub-flavored Markdown checkboxes and sections.

Used by ``memjective exec digest`` to count ``[x]`` / ``[ ]`` task-list
items inside roadmap files and to slice named sections out of body files
without buying into a full Markdown parser. Both helpers are pure and
easy to fixture.
"""

from __future__ import annotations

import re

# Match a Markdown task-list item: optional leading whitespace, a `-`/`*`/`+`
# bullet, whitespace, then `[x]` (any case) or `[ ]`. Captures the marker so
# the caller can tell checked from unchecked.
_TASK_ITEM_RE = re.compile(r"^\s*[-*+]\s+\[([ xX])\]\s+(.*)$")
_HEADING_RE = re.compile(r"^(#+)\s+(.+?)\s*$")


def count_checkboxes(md: str) -> tuple[int, int]:
    """Return ``(checked, total)`` task-list checkbox counts in ``md``.

    Counts every line matching ``- [x]`` / ``- [ ]`` (and ``*`` / ``+``
    bullet variants), regardless of indentation, so nested checklists are
    included. Returns ``(0, 0)`` when ``md`` is empty or contains no
    checkboxes.
    """
    checked = 0
    total = 0
    for line in md.splitlines():
        match = _TASK_ITEM_RE.match(line)
        if match is None:
            continue
        total += 1
        if match.group(1) in ("x", "X"):
            checked += 1
    return checked, total


def iter_checkbox_items(md: str) -> list[tuple[bool, str]]:
    """Return ``(checked, text)`` pairs for every task-list item in ``md``.

    Preserves source order and includes the post-checkbox label text with
    surrounding whitespace stripped. Used by callers that need the slice
    titles, not just the counts.
    """
    items: list[tuple[bool, str]] = []
    for line in md.splitlines():
        match = _TASK_ITEM_RE.match(line)
        if match is None:
            continue
        items.append((match.group(1) in ("x", "X"), match.group(2).strip()))
    return items


def extract_section(md: str, heading: str) -> str:
    """Return the body text under the first ``# … {heading}`` heading.

    Heading matching is case-insensitive and ignores leading/trailing
    whitespace. The returned text covers every line after the heading up
    to (but not including) the next heading of equal or higher level, with
    leading/trailing blank lines stripped. Returns ``""`` when the
    heading is not present.
    """
    needle = heading.strip().lower()
    lines = md.splitlines()
    start: int | None = None
    section_level: int | None = None

    for index, line in enumerate(lines):
        match = _HEADING_RE.match(line)
        if match is None:
            continue
        level = len(match.group(1))
        title = match.group(2).strip().lower()
        if start is None and title == needle:
            start = index + 1
            section_level = level
            continue
        if start is not None and section_level is not None and level <= section_level:
            return "\n".join(lines[start:index]).strip("\n").rstrip()

    if start is None:
        return ""
    return "\n".join(lines[start:]).strip("\n").rstrip()
