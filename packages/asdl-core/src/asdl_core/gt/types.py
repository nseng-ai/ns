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


StackWalkScope = Literal["load", "ancestor", "descendant", "trunk_marker"]
StackWalkKind = Literal[
    "fork",
    "cycle",
    "missing_row",
    "marker_missing",
    "marker_multiple",
    "marker_mismatch",
    "children_not_text",
    "children_invalid_json",
    "children_not_list",
    "children_non_string",
    "empty_branch_name",
]


@dataclass(frozen=True)
class StackWalkDiagnostic:
    """Structured anomaly found while reading Graphite stack metadata.

    ``branch`` is the fork point for ``fork``; the branch where a walk hit the
    cycle or missing row for ``cycle`` and ``missing_row``; the branch with bad
    children metadata for ``children_*``; and the ancestor-walk terminus for
    ``marker_*``. ``branch`` is ``None`` only for ``empty_branch_name``.

    ``children`` contains fork children for ``fork`` and marked trunk rows for
    ``marker_multiple`` and ``marker_mismatch``. Other kinds use ``()``.
    """

    scope: StackWalkScope
    kind: StackWalkKind
    branch: str | None
    children: tuple[str, ...] = ()


def render_stack_walk_warning(diagnostic: StackWalkDiagnostic) -> str:
    """Render a stack-walk diagnostic as the legacy human warning string."""
    if diagnostic.kind == "fork":
        return (
            f"branch {diagnostic.branch} has {len(diagnostic.children)} Graphite children; "
            "descendants follow the first child only"
        )
    if diagnostic.kind == "cycle":
        if diagnostic.scope == "ancestor":
            return (
                "cycle detected in Graphite parent metadata at "
                f"{diagnostic.branch}; ancestor walk stopped"
            )
        return (
            "cycle detected in Graphite children metadata at "
            f"{diagnostic.branch}; descendant walk stopped"
        )
    if diagnostic.kind == "missing_row":
        if diagnostic.scope == "ancestor":
            return (
                f"parent branch {diagnostic.branch} is missing from Graphite metadata; "
                "ancestor walk stopped"
            )
        return (
            f"child branch {diagnostic.branch} is missing from Graphite metadata; "
            "descendant walk stopped"
        )
    if diagnostic.kind == "marker_missing":
        return "trunk row marker missing"
    if diagnostic.kind == "marker_multiple":
        return "multiple Graphite metadata rows are marked as trunk"
    if diagnostic.kind == "marker_mismatch":
        return (
            "Graphite metadata trunk marker differs from ancestor-walk terminus: "
            f"{diagnostic.children[0]} != {diagnostic.branch}"
        )
    if diagnostic.kind == "children_not_text":
        return (
            f"children metadata for {diagnostic.branch} is not JSON text; treating as no children"
        )
    if diagnostic.kind == "children_invalid_json":
        return (
            f"children metadata for {diagnostic.branch} is not valid JSON; treating as no children"
        )
    if diagnostic.kind == "children_not_list":
        return (
            f"children metadata for {diagnostic.branch} is not a JSON list; treating as no children"
        )
    if diagnostic.kind == "children_non_string":
        return f"children metadata for {diagnostic.branch} contains non-string entries"
    if diagnostic.kind == "empty_branch_name":
        return "Graphite metadata row has an empty branch_name; row ignored"
    assert_never(diagnostic.kind)


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
    ``master → A → B(current) → C → D`` it is ``("C", "D")``. When produced
    by the metadata reader, ``warnings`` is the human rendering of
    ``diagnostics``.
    """

    trunk: str
    current: str
    ancestors: tuple[str, ...]
    children: tuple[str, ...]
    warnings: tuple[str, ...]
    descendants: tuple[str, ...] = ()
    diagnostics: tuple[StackWalkDiagnostic, ...] = ()

    def __post_init__(self) -> None:
        if not self.current:
            raise ValueError("StackInfo.current must name the current Graphite branch")
