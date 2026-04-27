from __future__ import annotations

import subprocess
from pathlib import Path

from twerk_slots.cli.slot.gt.gateway import GtGateway
from twerk_slots.cli.slot.gt.types import (
    GtBranchInfo,
    GtCommandFailure,
    NoParent,
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
