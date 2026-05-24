"""Branch-slice calculation for ``objective list`` work branch attribution."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import BranchCommitGraph, GitCommandFailure


@dataclass(frozen=True)
class ObjectiveBranchSlice:
    branch: str
    parent_branch: str
    range_spec: str
    slice_commits: int


def build_objective_branch_slices(
    git: GitGateway,
    *,
    local_branches: tuple[str, ...],
    base_branch: str,
) -> tuple[ObjectiveBranchSlice, ...]:
    """Build deterministic local branch slices rooted at nearest local ancestors."""
    work_branches = tuple(sorted(branch for branch in set(local_branches) if branch != base_branch))
    if not work_branches:
        return ()

    graph = git.commit_graph_from_base(base_branch=base_branch, branches=work_branches)
    if isinstance(graph, GitCommandFailure):
        raise ClinkrFailure(
            error_type="git_commit_graph_failed",
            message=graph.message,
        )
    return _build_objective_branch_slices_from_graph(
        graph,
        work_branches=work_branches,
        base_branch=base_branch,
    )


def _build_objective_branch_slices_from_graph(
    graph: BranchCommitGraph,
    *,
    work_branches: tuple[str, ...],
    base_branch: str,
) -> tuple[ObjectiveBranchSlice, ...]:
    tip_oid_by_branch = {tip.branch: tip.oid for tip in graph.branch_tips}
    parent_oids_by_oid = {commit.oid: commit.parent_oids for commit in graph.commits}
    reachable_oids_by_branch = {
        branch: _reachable_oids(tip_oid_by_branch.get(branch), parent_oids_by_oid)
        for branch in work_branches
    }
    ahead_counts = {branch: len(reachable_oids_by_branch[branch]) for branch in work_branches}

    slices: list[ObjectiveBranchSlice] = []
    for branch in work_branches:
        branch_ahead_count = ahead_counts[branch]
        parent_branch = _slice_parent_from_graph(
            branch=branch,
            work_branches=work_branches,
            tip_oid_by_branch=tip_oid_by_branch,
            reachable_oids=reachable_oids_by_branch[branch],
            ahead_counts=ahead_counts,
            base_branch=base_branch,
            branch_ahead_count=branch_ahead_count,
        )
        slice_commits = _slice_commits(
            parent_branch=parent_branch,
            base_branch=base_branch,
            branch_ahead_count=branch_ahead_count,
            ahead_counts=ahead_counts,
        )
        slices.append(
            ObjectiveBranchSlice(
                branch=branch,
                parent_branch=parent_branch,
                range_spec=f"{parent_branch}..{branch}",
                slice_commits=slice_commits,
            )
        )
    return tuple(slices)


def _reachable_oids(
    tip_oid: str | None,
    parent_oids_by_oid: dict[str, tuple[str, ...]],
) -> frozenset[str]:
    if tip_oid is None or tip_oid not in parent_oids_by_oid:
        return frozenset()

    seen: set[str] = set()
    stack = [tip_oid]
    while stack:
        oid = stack.pop()
        if oid in seen or oid not in parent_oids_by_oid:
            continue
        seen.add(oid)
        stack.extend(parent_oids_by_oid[oid])
    return frozenset(seen)


def _slice_parent_from_graph(
    *,
    branch: str,
    work_branches: tuple[str, ...],
    tip_oid_by_branch: dict[str, str],
    reachable_oids: frozenset[str],
    ahead_counts: dict[str, int],
    base_branch: str,
    branch_ahead_count: int,
) -> str:
    if branch_ahead_count <= 0:
        return base_branch

    eligible: list[tuple[int, str]] = []
    for candidate in work_branches:
        if candidate == branch:
            continue
        candidate_ahead_count = ahead_counts[candidate]
        if candidate_ahead_count <= 0:
            continue
        candidate_tip_oid = tip_oid_by_branch.get(candidate)
        if candidate_tip_oid is None or candidate_tip_oid not in reachable_oids:
            continue
        candidate_distance = branch_ahead_count - candidate_ahead_count
        if candidate_distance <= 0:
            continue
        eligible.append((candidate_distance, candidate))

    if not eligible:
        return base_branch
    return min(eligible)[1]


def _slice_commits(
    *,
    parent_branch: str,
    base_branch: str,
    branch_ahead_count: int,
    ahead_counts: dict[str, int],
) -> int:
    if parent_branch == base_branch:
        return branch_ahead_count
    return branch_ahead_count - ahead_counts[parent_branch]
