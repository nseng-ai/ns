from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, assert_never


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
class WalkCompleted:
    """A Graphite metadata walk reached a normal terminus."""


@dataclass(frozen=True)
class WalkCycle:
    """A Graphite metadata walk stopped after detecting a cycle."""

    branch: str


@dataclass(frozen=True)
class WalkRowMissing:
    """A Graphite metadata walk stopped because a referenced row was absent."""

    branch: str


WalkTermination = WalkCompleted | WalkCycle | WalkRowMissing

ChildrenCorruptionKind = Literal["not_text", "invalid_json", "not_list", "non_string"]


@dataclass(frozen=True)
class ChildrenCorruption:
    """Malformed Graphite children metadata on one branch row."""

    branch: str
    kind: ChildrenCorruptionKind


@dataclass(frozen=True)
class StackFork:
    """A Graphite branch row with multiple children during the descendant walk."""

    branch: str
    children: tuple[str, ...]


@dataclass(frozen=True)
class DescendantWalk:
    """Integrity facts collected while walking first-child descendants."""

    forks: tuple[StackFork, ...] = ()
    children_corruptions: tuple[ChildrenCorruption, ...] = ()
    termination: WalkTermination = WalkCompleted()

    @property
    def is_clean(self) -> bool:
        return (
            not self.forks
            and not self.children_corruptions
            and isinstance(self.termination, WalkCompleted)
        )


@dataclass(frozen=True)
class TrunkMarkerClean:
    """The ancestor-walk terminus is the only metadata row marked as trunk."""


TrunkMarkerTerminusState = Literal["row_missing", "unmarked", "marked"]


@dataclass(frozen=True)
class TrunkMarkerProblem:
    """Mismatch between ancestor-walk terminus and Graphite trunk markers."""

    terminus: str
    terminus_state: TrunkMarkerTerminusState
    marked_trunks: tuple[str, ...]


TrunkMarkerStatus = TrunkMarkerClean | TrunkMarkerProblem

EMPTY_BRANCH_NAME_WARNING = "Graphite metadata row has an empty branch_name; row ignored"
TRUNK_ROW_MARKER_MISSING_WARNING = "trunk row marker missing"
MULTIPLE_TRUNK_ROWS_MARKED_WARNING = "multiple Graphite metadata rows are marked as trunk"
TRUNK_MARKER_DIFFERS_WARNING_TEMPLATE = (
    "Graphite metadata trunk marker differs from ancestor-walk terminus: "
    "{marked_trunk} != {terminus}"
)


def render_ancestor_termination(termination: WalkCycle | WalkRowMissing) -> str:
    """Render a non-clean ancestor-walk termination as a legacy warning."""
    if isinstance(termination, WalkCycle):
        return (
            "cycle detected in Graphite parent metadata at "
            f"{termination.branch}; ancestor walk stopped"
        )
    if isinstance(termination, WalkRowMissing):
        return (
            f"parent branch {termination.branch} is missing from Graphite metadata; "
            "ancestor walk stopped"
        )
    assert_never(termination)


def render_descendant_termination(termination: WalkCycle | WalkRowMissing) -> str:
    """Render a non-clean descendant-walk termination as a legacy warning."""
    if isinstance(termination, WalkCycle):
        return (
            "cycle detected in Graphite children metadata at "
            f"{termination.branch}; descendant walk stopped"
        )
    if isinstance(termination, WalkRowMissing):
        return (
            f"child branch {termination.branch} is missing from Graphite metadata; "
            "descendant walk stopped"
        )
    assert_never(termination)


def render_stack_fork(fork: StackFork) -> str:
    """Render a descendant-walk fork as a legacy warning."""
    return (
        f"branch {fork.branch} has {len(fork.children)} Graphite children; "
        "descendants follow the first child only"
    )


def render_children_corruption(corruption: ChildrenCorruption) -> str:
    """Render malformed children metadata as a legacy warning."""
    if corruption.kind == "not_text":
        return (
            f"children metadata for {corruption.branch} is not JSON text; treating as no children"
        )
    if corruption.kind == "invalid_json":
        return (
            f"children metadata for {corruption.branch} is not valid JSON; treating as no children"
        )
    if corruption.kind == "not_list":
        return (
            f"children metadata for {corruption.branch} is not a JSON list; treating as no children"
        )
    if corruption.kind == "non_string":
        return f"children metadata for {corruption.branch} contains non-string entries"
    assert_never(corruption.kind)


def render_trunk_marker_problem(problem: TrunkMarkerProblem) -> tuple[str, ...]:
    """Render trunk-marker integrity problems as legacy warning strings."""
    if problem.terminus_state == "row_missing":
        return (TRUNK_ROW_MARKER_MISSING_WARNING,)

    warnings: list[str] = []
    if problem.terminus_state == "unmarked":
        warnings.append(TRUNK_ROW_MARKER_MISSING_WARNING)
    elif problem.terminus_state != "marked":
        assert_never(problem.terminus_state)

    if len(problem.marked_trunks) > 1:
        warnings.append(MULTIPLE_TRUNK_ROWS_MARKED_WARNING)
    if problem.marked_trunks and problem.terminus not in problem.marked_trunks:
        warnings.append(
            TRUNK_MARKER_DIFFERS_WARNING_TEMPLATE.format(
                marked_trunk=problem.marked_trunks[0],
                terminus=problem.terminus,
            )
        )
    return tuple(warnings)


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
    descendants: tuple[str, ...] = ()
    ancestor_termination: WalkTermination = WalkCompleted()
    descendant_walk: DescendantWalk = DescendantWalk()
    trunk_marker: TrunkMarkerStatus = TrunkMarkerClean()
    unwalked_children_corruptions: tuple[ChildrenCorruption, ...] = ()
    empty_branch_name_rows: int = 0

    def __post_init__(self) -> None:
        if not self.current:
            raise ValueError("StackInfo.current must name the current Graphite branch")

    def render_warnings(self) -> tuple[str, ...]:
        warnings: list[str] = []
        warnings.extend(EMPTY_BRANCH_NAME_WARNING for _ in range(self.empty_branch_name_rows))
        warnings.extend(
            render_children_corruption(corruption)
            for corruption in self.unwalked_children_corruptions
        )
        warnings.extend(
            render_children_corruption(corruption)
            for corruption in self.descendant_walk.children_corruptions
        )
        if isinstance(self.ancestor_termination, WalkCycle | WalkRowMissing):
            warnings.append(render_ancestor_termination(self.ancestor_termination))
        for fork in self.descendant_walk.forks:
            warnings.append(render_stack_fork(fork))
        if isinstance(self.descendant_walk.termination, WalkCycle | WalkRowMissing):
            warnings.append(render_descendant_termination(self.descendant_walk.termination))
        if isinstance(self.trunk_marker, TrunkMarkerProblem):
            warnings.extend(render_trunk_marker_problem(self.trunk_marker))
        return tuple(warnings)
