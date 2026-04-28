from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NoParent:
    """The current Graphite branch has no parent."""


@dataclass(frozen=True)
class UntrackedBranch:
    """Graphite does not track the current branch."""

    message: str


@dataclass(frozen=True)
class GtCommandFailure:
    """A ``gt`` command failed."""

    message: str
    returncode: int | None


@dataclass(frozen=True)
class GtBranchInfo:
    """Raw branch info from Graphite for diagnostics."""

    raw_output: str


@dataclass(frozen=True)
class StackInfo:
    """A snapshot of the Graphite stack around the currently checked-out branch.

    ``ancestors`` is the linear chain of parents from trunk down to (and
    including) the immediate parent of ``current``. It is ordered trunk-first
    and excludes ``current``. ``children`` lists the immediate children of
    ``current`` only (no recursion into grandchildren). ``descendants`` lists
    every aligned branch strictly below ``current`` in the gt log column,
    ordered top-to-bottom; for a linear stack ``master → A → B(current) → C →
    D`` it is ``("C", "D")``.
    """

    trunk: str
    current: str | None
    ancestors: tuple[str, ...]
    children: tuple[str, ...]
    warnings: tuple[str, ...]
    descendants: tuple[str, ...] = ()
