"""Projection of Objective-record work across a Graphite stack.

A single deep module. ONE public entry function, ``project_objective_stacks``,
and ONE frozen-dataclass result tree. All algorithm internals (scope selection,
touch extraction, grouping, segmentation, status, latest-work, ordering,
warnings) live here as private helpers plus a small internal ``_GraphContext``.

The module is gateway-facing and Clinkr-free: a hard gateway-read failure is
returned as the failure value (a sum-type return), never raised; the operation
layer owns the Clinkr translation. Non-fatal anomalies accumulate into
``ObjectiveStackProjection.warnings`` and never abort.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import GitCommandFailure
from asdl_core.gt.gateway import GtGateway
from asdl_core.gt.types import GtBranchGraph, GtCommandFailure, GtTrackedBranch
from asdl_objectives.list_branch_inventory import objective_statuses_from_paths
from asdl_objectives.objective_paths import (
    ACTIVE_OBJECTIVE_ROOT,
    objective_slug_from_active_path,
)

# ---------------------------------------------------------------------------
# Projection result dataclass tree (mirrors spec §7.3.2 exactly)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ObjectiveStackRow:
    branch: str
    parent: str | None
    depth: int
    touches_objective: bool
    connector: bool
    also_touches: tuple[str, ...]
    validation_result: str | None
    needs_restack: bool


@dataclass(frozen=True)
class ObjectiveStackSegment:
    index: int
    rows: tuple[ObjectiveStackRow, ...]


@dataclass(frozen=True)
class ObjectiveStackLatestWork:
    branch: str
    committed_iso: str
    oid: str


@dataclass(frozen=True)
class ObjectiveStackGroup:
    slug: str
    status: str
    objective_branch_count: int
    segment_count: int
    latest_work: ObjectiveStackLatestWork | None
    segments: tuple[ObjectiveStackSegment, ...]


@dataclass(frozen=True)
class ObjectiveStackProjection:
    trunk_branch: str
    warnings: tuple[str, ...]
    objectives: tuple[ObjectiveStackGroup, ...]


# ---------------------------------------------------------------------------
# Read-failure attribution sentinels (§4)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _SliceReadFailure(GitCommandFailure):
    """A per-branch ``parent..branch`` slice read failed."""


@dataclass(frozen=True)
class _TrunkStatusReadFailure(GitCommandFailure):
    """The trunk Objective-status read failed."""


_ACTIVE_ROOT = ACTIVE_OBJECTIVE_ROOT.as_posix()

# A timestamp that cannot be interpreted sorts as OLDER than any real commit.
_OLDEST = datetime.min.replace(tzinfo=UTC)


def _normalize_iso(committed_iso: str) -> datetime:
    """Parse an ISO-8601 timestamp into an aware UTC datetime.

    ``Z`` is accepted as ``+00:00``; a naive timestamp is assumed UTC. An
    uninterpretable timestamp normalizes to ``_OLDEST`` so it sorts oldest.
    """
    text = committed_iso.strip()
    if text.endswith(("Z", "z")):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return _OLDEST
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


# ---------------------------------------------------------------------------
# Per-branch touch extraction
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _BranchTouch:
    """The latest commit within a branch slice that touched one Objective."""

    oid: str
    committed_iso: str


def _compute_branch_touches(
    git: GitGateway,
    *,
    branch: str,
    parent: str,
) -> dict[str, _BranchTouch] | GitCommandFailure:
    """Map each touched slug to the newest touching commit in ``parent..branch``.

    Only paths under the active root register. Archive-root paths and bare
    ``.asdl/objectives/<slug>`` directory paths (no child file) are ignored.
    Deletions register because any touched active-root path is a touch.
    """
    slice_range = f"{parent}..{branch}"
    result = git.path_touches_under(slice_range, _ACTIVE_ROOT)
    if isinstance(result, GitCommandFailure):
        return result

    touches: dict[str, _BranchTouch] = {}
    for commit in result:
        for path in commit.paths:
            slug = objective_slug_from_active_path(path)
            if slug is None:
                continue
            existing = touches.get(slug)
            if existing is None or _normalize_iso(commit.committed_iso) > _normalize_iso(
                existing.committed_iso
            ):
                touches[slug] = _BranchTouch(oid=commit.oid, committed_iso=commit.committed_iso)
    return touches


# ---------------------------------------------------------------------------
# Warning accumulator (de-duplicated, insertion-ordered)
# ---------------------------------------------------------------------------


class _Warnings:
    """Append-only de-duplicated warning list preserving first-seen order."""

    def __init__(self) -> None:
        self._seen: set[str] = set()
        self._ordered: list[str] = []

    def add(self, message: str) -> None:
        if message in self._seen:
            return
        self._seen.add(message)
        self._ordered.append(message)

    def extend(self, messages: tuple[str, ...]) -> None:
        for message in messages:
            self.add(message)

    def as_tuple(self) -> tuple[str, ...]:
        return tuple(self._ordered)


# ---------------------------------------------------------------------------
# Internal graph context — built once from the branch graph + local set
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _GraphContext:
    trunk: str
    nodes_by_name: dict[str, GtTrackedBranch]
    in_scope: frozenset[str]  # non-trunk branches that survive scope selection

    def parent_of(self, branch: str) -> str | None:
        node = self.nodes_by_name.get(branch)
        return node.parent if node is not None else None


def _build_graph_context(
    graph: GtBranchGraph,
    *,
    local_branches: frozenset[str],
    warnings: _Warnings,
) -> _GraphContext:
    nodes_by_name = {node.name: node for node in graph.branches}
    trunk = graph.trunk

    in_scope: set[str] = set()
    # Memoized scope determination per branch.
    state: dict[str, bool] = {}

    def is_in_scope(branch: str, stack: tuple[str, ...]) -> bool:
        if branch in state:
            return state[branch]
        # Cycle guard during the scope walk.
        if branch in stack:
            state[branch] = False
            return False
        node = nodes_by_name.get(branch)
        if node is None:
            state[branch] = False
            return False
        # Not present locally -> never in scope (handled by caller; this guards
        # the recursive ancestor check).
        if branch not in local_branches:
            state[branch] = False
            return False
        parent = node.parent
        if parent is None or parent == trunk:
            # Roots directly under trunk are in scope when locally present.
            result = True
        elif is_in_scope(parent, (*stack, branch)):
            result = True
        else:
            # Parent is out of scope: this branch is severed from the trunk.
            warnings.add(
                f"Graphite branch '{branch}' has unavailable local parent '{parent}'; skipping."
            )
            result = False
        state[branch] = result
        return result

    for node in graph.branches:
        if node.name == trunk:
            continue
        if node.name not in local_branches:
            continue
        if is_in_scope(node.name, ()):
            in_scope.add(node.name)

    return _GraphContext(
        trunk=trunk,
        nodes_by_name=nodes_by_name,
        in_scope=frozenset(in_scope),
    )


# ---------------------------------------------------------------------------
# Objective group assembly
# ---------------------------------------------------------------------------


def _collect_group_members(
    slug: str,
    objective_branches: tuple[str, ...],
    context: _GraphContext,
    warnings: _Warnings,
) -> set[str]:
    """Build the include-set for one Objective: touching branches plus their
    non-trunk, in-scope ancestor chains. Ancestor-walk anomalies warn but never
    abort; the Objective is still reported with whatever could be assembled.
    """
    members: set[str] = set()
    for branch in objective_branches:
        members.add(branch)
        seen: set[str] = {branch}
        current = branch
        while True:
            node = context.nodes_by_name.get(current)
            parent = node.parent if node is not None else None
            if parent == context.trunk:
                break
            if parent is None:
                warnings.add(
                    f"Objective '{slug}': branch '{current}' has no Graphite "
                    f"parent; ancestor walk stopped."
                )
                break
            if parent not in context.nodes_by_name:
                warnings.add(
                    f"Objective '{slug}': branch '{current}' references missing "
                    f"Graphite parent '{parent}'; ancestor walk stopped."
                )
                break
            if parent in seen:
                warnings.add(
                    f"Objective '{slug}': cycle detected at Graphite parent "
                    f"'{parent}'; ancestor walk stopped."
                )
                break
            if parent not in context.in_scope:
                # Parent is tracked but out of scope; cannot extend the chain.
                break
            members.add(parent)
            seen.add(parent)
            current = parent
    return members


def _partition_segments(members: set[str], context: _GraphContext) -> tuple[tuple[str, ...], ...]:
    """Partition the include-set into connected components by parent/child links,
    each ordered as a pre-order DFS from its root (parent outside the set).

    Returns a tuple of segments; each segment is a tuple of branch names in
    stack order (parents before children). Segments are ordered by their root's
    position among the trunk's children, then by root name for stability.
    """
    member_set = set(members)
    # Roots: members whose parent is not itself a member.
    roots = [branch for branch in member_set if context.parent_of(branch) not in member_set]

    def child_order(parent: str) -> list[str]:
        node = context.nodes_by_name.get(parent)
        if node is None:
            return []
        # Preserve Graphite's recorded child order; restrict to members.
        return [child for child in node.children if child in member_set]

    segments: list[tuple[str, ...]] = []
    for root in roots:
        ordered: list[str] = []
        # Pre-order DFS, parents before children, children in graph order.
        # Use an explicit stack with reversed children so the left-most child is
        # visited first.
        work: list[str] = [root]
        visited: set[str] = set()
        while work:
            branch = work.pop()
            if branch in visited:
                continue
            visited.add(branch)
            ordered.append(branch)
            children = child_order(branch)
            for child in reversed(children):
                work.append(child)
        segments.append(tuple(ordered))

    # Stable segment order: by the root's index among trunk children, then name.
    trunk_node = context.nodes_by_name.get(context.trunk)
    trunk_children = list(trunk_node.children) if trunk_node is not None else []

    def segment_sort_key(segment: tuple[str, ...]) -> tuple[int, str]:
        root = segment[0]
        # Find the topmost ancestor of the root within trunk's children.
        position = trunk_children.index(root) if root in trunk_children else len(trunk_children)
        return (position, root)

    return tuple(sorted(segments, key=segment_sort_key))


def _build_rows(
    segment: tuple[str, ...],
    slug: str,
    context: _GraphContext,
    touches_by_branch: dict[str, dict[str, _BranchTouch]],
) -> tuple[ObjectiveStackRow, ...]:
    member_set = set(segment)
    depth_by_branch = _segment_depths(segment, context, member_set)
    rows: list[ObjectiveStackRow] = []
    for branch in segment:
        node = context.nodes_by_name.get(branch)
        branch_touches = touches_by_branch.get(branch, {})
        touches_objective = slug in branch_touches
        also_touches = tuple(sorted(other for other in branch_touches if other != slug))
        # parent is the branch's recorded Graphite parent (including the trunk
        # for a segment root). It is null ONLY for a root whose graph node has
        # no recorded parent at all.
        row_parent = node.parent if node is not None else None
        rows.append(
            ObjectiveStackRow(
                branch=branch,
                parent=row_parent,
                depth=depth_by_branch[branch],
                touches_objective=touches_objective,
                connector=not touches_objective,
                also_touches=also_touches,
                validation_result=node.validation_result if node is not None else None,
                needs_restack=node.needs_restack if node is not None else False,
            )
        )
    return tuple(rows)


def _segment_depths(
    segment: tuple[str, ...],
    context: _GraphContext,
    member_set: set[str],
) -> dict[str, int]:
    depths: dict[str, int] = {}
    for branch in segment:
        parent = context.parent_of(branch)
        if parent in member_set:
            depths[branch] = depths[parent] + 1
        else:
            depths[branch] = 0
    return depths


def _compute_latest_work(
    objective_branches: tuple[str, ...],
    slug: str,
    touches_by_branch: dict[str, dict[str, _BranchTouch]],
) -> ObjectiveStackLatestWork | None:
    """Newest Objective-touching commit across the Objective branches.

    Tie-break: timestamp -> branch name -> oid. Uninterpretable timestamps sort
    oldest. Connectors never participate (they are not in ``objective_branches``).
    """
    candidates: list[tuple[datetime, str, str, str]] = []
    for branch in objective_branches:
        touch = touches_by_branch.get(branch, {}).get(slug)
        if touch is None:
            continue
        candidates.append(
            (_normalize_iso(touch.committed_iso), branch, touch.oid, touch.committed_iso)
        )
    if not candidates:
        return None
    # Newest by timestamp; tie-break branch then oid (both ascending so the
    # deterministic winner is the smallest branch/oid at the newest timestamp).
    best = max(candidates, key=lambda c: (c[0], _Reverse(c[1]), _Reverse(c[2])))
    return ObjectiveStackLatestWork(branch=best[1], committed_iso=best[3], oid=best[2])


@dataclass(frozen=True)
class _Reverse:
    """Wrap a string so that ``max`` selects the lexicographically SMALLEST."""

    value: str

    def __lt__(self, other: _Reverse) -> bool:
        return self.value > other.value


def _objective_status(slug: str, trunk_statuses: dict[str, str]) -> str:
    status = trunk_statuses.get(slug)
    if status is None:
        return "in-flight"
    return status


def _read_trunk_statuses(git: GitGateway, trunk_ref: str) -> dict[str, str] | GitCommandFailure:
    """Read trunk active-record presence + closed markers into slug -> status.

    A slug present on trunk with no ``closed.md`` is ``open``; with ``closed.md``
    it is ``closed``. Slugs absent from trunk are not in the map (caller maps to
    ``in-flight``).
    """
    paths = git.list_tracked_paths_at_ref(trunk_ref, _ACTIVE_ROOT)
    if isinstance(paths, GitCommandFailure):
        return paths
    return dict(objective_statuses_from_paths(paths))


# ---------------------------------------------------------------------------
# Public entry function
# ---------------------------------------------------------------------------


def project_objective_stacks(
    gt: GtGateway,
    git: GitGateway,
    *,
    trunk_ref: str,
    cwd: Path,
) -> ObjectiveStackProjection | GtCommandFailure | GitCommandFailure:
    graph = gt.branch_graph(cwd)
    if isinstance(graph, GtCommandFailure):
        return graph

    warnings = _Warnings()
    warnings.extend(graph.warnings)

    local_branches = frozenset(git.list_local_branches())
    context = _build_graph_context(graph, local_branches=local_branches, warnings=warnings)

    # Per-branch slice touches for every in-scope branch.
    touches_by_branch: dict[str, dict[str, _BranchTouch]] = {}
    for branch in sorted(context.in_scope):
        parent = context.parent_of(branch)
        if parent is None:
            continue
        branch_touches = _compute_branch_touches(git, branch=branch, parent=parent)
        if isinstance(branch_touches, GitCommandFailure):
            return _SliceReadFailure(
                message=branch_touches.message,
                returncode=branch_touches.returncode,
            )
        touches_by_branch[branch] = branch_touches

    # Every touched slug yields exactly one Objective group.
    touched_slugs: set[str] = set()
    for branch_touches in touches_by_branch.values():
        touched_slugs.update(branch_touches)

    if not touched_slugs:
        return ObjectiveStackProjection(
            trunk_branch=graph.trunk,
            warnings=warnings.as_tuple(),
            objectives=(),
        )

    # Trunk status read (single read; failure aborts).
    trunk_statuses = _read_trunk_statuses(git, trunk_ref)
    if isinstance(trunk_statuses, GitCommandFailure):
        return _TrunkStatusReadFailure(
            message=trunk_statuses.message,
            returncode=trunk_statuses.returncode,
        )

    groups: list[ObjectiveStackGroup] = []
    for slug in sorted(touched_slugs):
        objective_branches = tuple(
            sorted(
                branch
                for branch, branch_touches in touches_by_branch.items()
                if slug in branch_touches
            )
        )
        members = _collect_group_members(slug, objective_branches, context, warnings)
        segment_branch_tuples = _partition_segments(members, context)
        segments = tuple(
            ObjectiveStackSegment(
                index=index,
                rows=_build_rows(branches, slug, context, touches_by_branch),
            )
            for index, branches in enumerate(segment_branch_tuples, start=1)
        )
        groups.append(
            ObjectiveStackGroup(
                slug=slug,
                status=_objective_status(slug, trunk_statuses),
                objective_branch_count=len(objective_branches),
                segment_count=len(segments),
                latest_work=_compute_latest_work(objective_branches, slug, touches_by_branch),
                segments=segments,
            )
        )

    return ObjectiveStackProjection(
        trunk_branch=graph.trunk,
        warnings=warnings.as_tuple(),
        objectives=tuple(groups),
    )
