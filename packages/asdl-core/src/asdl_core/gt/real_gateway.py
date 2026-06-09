"""Real Graphite gateway implementation.

``RealGtGateway.stack()`` resolves the git common directory and current branch,
then delegates Graphite SQLite metadata-store reading to
``asdl_core.gt.metadata_reader``. The reader owns the supported named-column
schema contract and schema-mismatch failure behavior instead of falling back to
human-facing ``gt`` log text parsing.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from asdl_core.gt.gateway import GtGateway
from asdl_core.gt.metadata_reader import read_stack_from_metadata_db
from asdl_core.gt.types import (
    GtBranchInfo,
    GtCommandFailure,
    NoParent,
    StackInfo,
    UntrackedBranch,
)


def _run(argv: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(argv, cwd=cwd, capture_output=True, text=True)
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(argv, 127, stdout="", stderr=str(exc))


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


def _resolve_git_common_dir(cwd: Path) -> Path | None:
    result = _run(["git", "rev-parse", "--git-common-dir"], cwd=cwd)
    if result.returncode != 0:
        return None
    lines = _nonempty_lines(result.stdout)
    if not lines:
        return None
    common_dir = Path(lines[0])
    if common_dir.is_absolute():
        return common_dir
    return cwd / common_dir


def _resolve_current_branch(cwd: Path) -> str | None:
    result = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=cwd)
    if result.returncode != 0:
        return None
    lines = _nonempty_lines(result.stdout)
    if not lines:
        return None
    return lines[0]


class RealGtGateway(GtGateway):
    """Real Graphite gateway backed by Graphite metadata and the ``gt`` CLI."""

    def parent_of(self, cwd: Path) -> str | NoParent | UntrackedBranch | GtCommandFailure:
        result = _run(["gt", "parent", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _untracked_or_failure(result)
        lines = _nonempty_lines(result.stdout)
        if not lines:
            return NoParent()
        return lines[0]

    def children_of(self, cwd: Path) -> tuple[str, ...] | UntrackedBranch | GtCommandFailure:
        result = _run(["gt", "children", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _untracked_or_failure(result)
        return _nonempty_lines(result.stdout)

    def trunk(self, cwd: Path) -> str | GtCommandFailure:
        result = _run(["gt", "trunk", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _failure(result)
        lines = _nonempty_lines(result.stdout)
        if not lines:
            return GtCommandFailure(message="gt trunk returned no branch", returncode=0)
        return lines[0]

    def branch_info(self, cwd: Path) -> GtBranchInfo | UntrackedBranch | GtCommandFailure:
        result = _run(["gt", "branch", "info", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _untracked_or_failure(result)
        return GtBranchInfo(raw_output=result.stdout)

    def restack_upstack(self, cwd: Path, branch: str) -> GtCommandFailure | None:
        # gt restack accepts --branch even when invoked from the branch's own
        # worktree; redundant but explicit and survives if cwd inference
        # changes upstream.
        result = _run(
            ["gt", "restack", "--branch", branch, "--upstack", "--no-interactive"],
            cwd=cwd,
        )
        if result.returncode != 0:
            return _failure(result)
        return None

    def sync(self, cwd: Path, *, restack: bool) -> GtCommandFailure | None:
        args = ["gt", "sync", "--no-interactive", "--force"]
        if not restack:
            args.append("--no-restack")
        result = _run(args, cwd=cwd)
        if result.returncode != 0:
            return _failure(result)
        return None

    def stack(self, cwd: Path) -> StackInfo | UntrackedBranch | GtCommandFailure:
        common_dir = _resolve_git_common_dir(cwd)
        if common_dir is None:
            return GtCommandFailure(
                message=("Could not resolve git common dir with `git rev-parse --git-common-dir`"),
                returncode=None,
            )

        current_branch = _resolve_current_branch(cwd)
        if current_branch is None:
            return GtCommandFailure(
                message=("Could not resolve current branch with `git rev-parse --abbrev-ref HEAD`"),
                returncode=None,
            )

        return read_stack_from_metadata_db(
            common_dir / ".graphite_metadata.db",
            current_branch,
        )
