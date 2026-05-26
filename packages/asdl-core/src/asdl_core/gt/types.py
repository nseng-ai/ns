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
    """A Graphite command or metadata read failed."""

    message: str
    returncode: int | None


@dataclass(frozen=True)
class GtBranchInfo:
    """Raw branch info from Graphite for diagnostics."""

    raw_output: str


@dataclass(frozen=True)
class GtTrackedBranch:
    """One Graphite-tracked branch row in a trunk-scoped branch graph."""

    name: str
    parent: str | None
    children: tuple[str, ...]
    validation_result: str | None
    needs_restack: bool = False

    def __post_init__(self) -> None:
        if not self.name:
            raise ValueError("GtTrackedBranch.name must name a Graphite branch")


@dataclass(frozen=True)
class GtBranchGraph:
    """A Graphite branch graph rooted at the configured Graphite trunk."""

    trunk: str
    branches: tuple[GtTrackedBranch, ...]
    warnings: tuple[str, ...]

    def __post_init__(self) -> None:
        if not self.trunk:
            raise ValueError("GtBranchGraph.trunk must name the configured Graphite trunk")

        branch_names = tuple(branch.name for branch in self.branches)
        if len(set(branch_names)) != len(branch_names):
            raise ValueError("GtBranchGraph.branches must not contain duplicate branch names")


@dataclass(frozen=True)
class StackInfo:
    """A snapshot of the Graphite stack around the currently checked-out branch.

    ``current`` is the branch checked out at the ``cwd`` used for the stack
    read. A stack read that cannot identify the current Graphite branch is not
    a ``StackInfo``; it is an ``UntrackedBranch`` or ``GtCommandFailure``.
    ``ancestors`` is the linear chain of parents from trunk down to (and
    including) the immediate parent of ``current``. It is ordered trunk-first
    and excludes ``current``. ``children`` lists the immediate children of
    ``current`` only (no recursion into grandchildren). ``descendants`` follows
    the first-child walk away from ``current``; for a linear stack
    ``master → A → B(current) → C → D`` it is ``("C", "D")``.
    """

    trunk: str
    current: str
    ancestors: tuple[str, ...]
    children: tuple[str, ...]
    warnings: tuple[str, ...]
    descendants: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.current:
            raise ValueError("StackInfo.current must name the current Graphite branch")
