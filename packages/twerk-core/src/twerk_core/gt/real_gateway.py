from __future__ import annotations

import subprocess
from pathlib import Path

from twerk_core.gt.gateway import GtGateway
from twerk_core.gt.types import (
    GtBranchInfo,
    GtCommandFailure,
    NoParent,
    StackInfo,
    UntrackedBranch,
)


def _run_gt(args: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
    cmd = ["gt", *args]
    try:
        return subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(
            cmd,
            127,
            stdout="",
            stderr=str(exc),
        )


def _failure(result: subprocess.CompletedProcess[str]) -> GtCommandFailure:
    return GtCommandFailure(
        message=(result.stderr or result.stdout).strip() or "gt command failed",
        returncode=result.returncode,
    )


# `gt` does not expose a stable exit code or machine-readable error type for
# "branch is untracked"; we match against its current human-readable phrase.
# If gt changes wording, expand this tuple. Grep on `_UNTRACKED_PHRASES` to
# find every brittle bit at once.
_UNTRACKED_PHRASES: tuple[str, ...] = ("untracked branch",)


def _untracked_or_failure(
    result: subprocess.CompletedProcess[str],
) -> UntrackedBranch | GtCommandFailure:
    message = (result.stderr or result.stdout).strip() or "gt command failed"
    lowered = message.lower()
    if any(phrase in lowered for phrase in _UNTRACKED_PHRASES):
        return UntrackedBranch(message=message)
    return GtCommandFailure(message=message, returncode=result.returncode)


def _nonempty_lines(stdout: str) -> tuple[str, ...]:
    return tuple(line.strip() for line in stdout.splitlines() if line.strip())


_CURRENT_MARKER = "◉"  # ◉
_OTHER_MARKER = "◯"  # ◯


def _marker_position(line: str) -> tuple[int, str] | None:
    for idx, ch in enumerate(line):
        if ch == _CURRENT_MARKER or ch == _OTHER_MARKER:
            return idx, ch
    return None


def _branch_name_from_line(line: str, marker_idx: int) -> str:
    # Strip the marker and the two-space gutter that follows it; trim any
    # parens-annotation gt appends (e.g. ``(code/twerk)`` or ``(needs restack)``).
    tail = line[marker_idx + 1 :].lstrip()
    paren = tail.find(" (")
    name = tail if paren == -1 else tail[:paren]
    return name.strip()


def parse_stack_output(stdout: str) -> StackInfo | None:
    """Parse ``gt log short --stack -r --no-interactive`` output.

    Linear stacks (every entry at the same column) parse deterministically:
    the line with ``◉`` is current, lines above are ancestors trunk-first,
    lines below are children-side. For non-linear visual layouts (sibling
    branches off ancestors, multi-child forks), this parser keeps only
    entries that share the current branch's marker column and emits a
    warning. Returns ``None`` if no current marker is present.
    """
    raw_lines = [line for line in stdout.splitlines() if line.strip()]
    entries: list[tuple[int, int, str, str]] = []  # (line_idx, col, marker, branch)
    for idx, line in enumerate(raw_lines):
        position = _marker_position(line)
        if position is None:
            continue
        col, marker = position
        branch = _branch_name_from_line(line, col)
        if not branch:
            continue
        entries.append((idx, col, marker, branch))

    current_entries = [e for e in entries if e[2] == _CURRENT_MARKER]
    if not current_entries:
        return None
    current_idx, current_col, _, current_name = current_entries[0]

    warnings: list[str] = []
    if len(current_entries) > 1:
        warnings.append("multiple current markers found in gt log output")

    off_column = sum(1 for e in entries if e[1] != current_col)
    if off_column:
        warnings.append(
            f"{off_column} branch(es) in gt log output sit outside the current "
            "branch's column and were not included in the stack walk"
        )

    aligned = [e for e in entries if e[1] == current_col]
    ancestors = tuple(e[3] for e in aligned if e[0] < current_idx)
    children = tuple(e[3] for e in aligned if e[0] > current_idx)

    if not ancestors:
        return StackInfo(
            trunk=current_name,
            current=current_name,
            ancestors=(),
            children=children,
            warnings=tuple(warnings),
        )
    return StackInfo(
        trunk=ancestors[0],
        current=current_name,
        ancestors=ancestors,
        children=children,
        warnings=tuple(warnings),
    )


class RealGtGateway(GtGateway):
    """Real Graphite gateway backed by the ``gt`` CLI."""

    def parent_of(self, cwd: Path) -> str | NoParent | UntrackedBranch | GtCommandFailure:
        result = _run_gt(["parent", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _untracked_or_failure(result)
        lines = _nonempty_lines(result.stdout)
        if not lines:
            return NoParent()
        return lines[0]

    def children_of(self, cwd: Path) -> tuple[str, ...] | UntrackedBranch | GtCommandFailure:
        result = _run_gt(["children", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _untracked_or_failure(result)
        return _nonempty_lines(result.stdout)

    def trunk(self, cwd: Path) -> str | GtCommandFailure:
        result = _run_gt(["trunk", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _failure(result)
        lines = _nonempty_lines(result.stdout)
        if not lines:
            return GtCommandFailure(message="gt trunk returned no branch", returncode=0)
        return lines[0]

    def branch_info(self, cwd: Path) -> GtBranchInfo | UntrackedBranch | GtCommandFailure:
        result = _run_gt(["branch", "info", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _untracked_or_failure(result)
        return GtBranchInfo(raw_output=result.stdout)

    def restack_upstack(self, cwd: Path, branch: str) -> GtCommandFailure | None:
        # gt restack accepts --branch even when invoked from the branch's own
        # worktree; redundant but explicit and survives if cwd inference
        # changes upstream.
        result = _run_gt(
            ["restack", "--branch", branch, "--upstack", "--no-interactive"],
            cwd=cwd,
        )
        if result.returncode != 0:
            return _failure(result)
        return None

    def sync(self, cwd: Path, *, restack: bool) -> GtCommandFailure | None:
        args = ["sync", "--no-interactive", "--force"]
        if not restack:
            args.append("--no-restack")
        result = _run_gt(args, cwd=cwd)
        if result.returncode != 0:
            return _failure(result)
        return None

    def stack(self, cwd: Path) -> StackInfo | GtCommandFailure:
        log_result = _run_gt(
            ["log", "short", "--stack", "-r", "--no-interactive"],
            cwd=cwd,
        )
        if log_result.returncode != 0:
            return _failure(log_result)
        parsed = parse_stack_output(log_result.stdout)
        if parsed is None:
            return GtCommandFailure(
                message="gt log short --stack returned no current-branch marker",
                returncode=0,
            )

        # `gt log short --stack` shows the current stack only; if the visual
        # layout is non-linear (siblings of ancestors / fork children), the
        # parser may drop or misclassify children. Cross-check immediate
        # children with `gt children --no-interactive`, which is unambiguous
        # for the cwd's branch.
        children_result = _run_gt(["children", "--no-interactive"], cwd=cwd)
        if children_result.returncode == 0:
            authoritative_children = _nonempty_lines(children_result.stdout)
            warnings = parsed.warnings
            if set(authoritative_children) != set(parsed.children):
                warnings = (
                    *warnings,
                    "stack children differ between gt log parse and gt children",
                )
            return StackInfo(
                trunk=parsed.trunk,
                current=parsed.current,
                ancestors=parsed.ancestors,
                children=authoritative_children,
                warnings=warnings,
            )
        # `gt children` failed; return parser output with a warning.
        return StackInfo(
            trunk=parsed.trunk,
            current=parsed.current,
            ancestors=parsed.ancestors,
            children=parsed.children,
            warnings=(
                *parsed.warnings,
                "gt children unavailable; falling back to gt log parse",
            ),
        )
