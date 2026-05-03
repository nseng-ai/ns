"""Classify reviewer findings by whether GitHub can receive inline comments.

Reviewer findings may legitimately carry ``line: null`` in the findings schema.
Those findings remain valid fallback comments, but they cannot be converted into
GitHub PR inline comments because the PR review-comments API requires a concrete
right-side diff line.
"""

from __future__ import annotations

import dataclasses
import re
from dataclasses import dataclass
from typing import Literal

from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.gh.types import PRChangedFile
from asdl_reviewer.cli.reviewer.exec.format_findings_comment import FindingRow

FallbackReason = Literal[
    "missing_line",
    "file_not_changed",
    "patch_unavailable",
    "line_not_in_diff",
]

_HUNK_HEADER_RE = re.compile(r"^@@ -\d+(?:,\d+)? \+(?P<start>\d+)(?:,\d+)? @@")


@dataclass(frozen=True)
class InlineTarget:
    path: str
    line: int


@dataclass(frozen=True)
class InlineableFinding:
    finding: FindingRow
    target: InlineTarget


@dataclass(frozen=True)
class FallbackOnlyFinding:
    finding: FindingRow
    reason: FallbackReason


@dataclass(frozen=True)
class InlineCommentabilityResult(JsonSerializable):
    inlineable: tuple[InlineableFinding, ...]
    fallback_only: tuple[FallbackOnlyFinding, ...]

    def to_json_dict(self) -> dict[str, object]:
        return result_to_json_dict(self)


def commentable_right_side_lines(patch: str | None) -> frozenset[int]:
    """Return right-side line numbers present in a GitHub unified-diff patch.

    Context lines and added lines are commentable on the PR's right side.
    Deleted lines are left-side-only and therefore are not returned. A missing
    patch means GitHub did not provide commentable hunk metadata (for example,
    binary or too-large files), so no line is considered inline-commentable.
    """
    if patch is None:
        return frozenset()

    lines: set[int] = set()
    right_line: int | None = None

    for patch_line in patch.splitlines():
        hunk_match = _HUNK_HEADER_RE.match(patch_line)
        if hunk_match is not None:
            right_line = int(hunk_match.group("start"))
            continue

        if right_line is None:
            continue
        if patch_line.startswith("\\"):
            continue
        if patch_line.startswith("-"):
            continue
        if patch_line.startswith("+") or patch_line.startswith(" "):
            lines.add(right_line)
            right_line += 1

    return frozenset(lines)


def classify_inline_findings(
    findings: tuple[FindingRow, ...],
    changed_files: tuple[PRChangedFile, ...],
) -> InlineCommentabilityResult:
    changed_by_path = {file.path: file for file in changed_files}
    lines_by_path = {
        file.path: commentable_right_side_lines(file.patch)
        for file in changed_files
        if file.patch is not None
    }

    inlineable: list[InlineableFinding] = []
    fallback_only: list[FallbackOnlyFinding] = []

    for finding in findings:
        if finding.line is None:
            fallback_only.append(FallbackOnlyFinding(finding=finding, reason="missing_line"))
            continue

        changed_file = changed_by_path.get(finding.path)
        if changed_file is None:
            fallback_only.append(FallbackOnlyFinding(finding=finding, reason="file_not_changed"))
            continue

        if changed_file.patch is None:
            fallback_only.append(FallbackOnlyFinding(finding=finding, reason="patch_unavailable"))
            continue

        if finding.line not in lines_by_path[finding.path]:
            fallback_only.append(FallbackOnlyFinding(finding=finding, reason="line_not_in_diff"))
            continue

        inlineable.append(
            InlineableFinding(
                finding=finding,
                target=InlineTarget(path=finding.path, line=finding.line),
            )
        )

    return InlineCommentabilityResult(
        inlineable=tuple(inlineable),
        fallback_only=tuple(fallback_only),
    )


def result_to_json_dict(result: InlineCommentabilityResult) -> dict[str, object]:
    return {
        "inlineable": [
            {
                "finding": dataclasses.asdict(item.finding),
                "target": dataclasses.asdict(item.target),
            }
            for item in result.inlineable
        ],
        "fallback_only": [
            {
                "finding": dataclasses.asdict(item.finding),
                "reason": item.reason,
            }
            for item in result.fallback_only
        ],
    }
