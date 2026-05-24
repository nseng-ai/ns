"""Branch-slice calculation for ``objective list`` work branch attribution."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import GitCommandFailure


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
    work_branch_set = set(work_branches)
    ahead_counts = _count_ahead_of_base(
        git,
        work_branches=work_branches,
        base_branch=base_branch,
    )

    slices: list[ObjectiveBranchSlice] = []
    for branch in work_branches:
        branch_ahead_count = ahead_counts[branch]
        if isinstance(branch_ahead_count, GitCommandFailure):
            raise ClinkrFailure(
                error_type="git_slice_count_failed",
                message=branch_ahead_count.message,
            )

        parent_branch = _slice_parent(
            git,
            branch=branch,
            work_branch_set=work_branch_set,
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


def _count_ahead_of_base(
    git: GitGateway,
    *,
    work_branches: tuple[str, ...],
    base_branch: str,
) -> dict[str, int | GitCommandFailure]:
    return {
        branch: git.count_commits_in_range(f"{base_branch}..{branch}") for branch in work_branches
    }


def _slice_parent(
    git: GitGateway,
    *,
    branch: str,
    work_branch_set: set[str],
    ahead_counts: dict[str, int | GitCommandFailure],
    base_branch: str,
    branch_ahead_count: int,
) -> str:
    if branch_ahead_count <= 0:
        return base_branch

    merged_branches = git.list_branches_merged_into(branch)
    if isinstance(merged_branches, GitCommandFailure):
        raise ClinkrFailure(
            error_type="git_merged_branches_failed",
            message=merged_branches.message,
        )

    eligible: list[tuple[int, str]] = []
    for candidate in merged_branches:
        if candidate == branch or candidate not in work_branch_set:
            continue
        candidate_ahead_count = ahead_counts.get(candidate)
        if not isinstance(candidate_ahead_count, int) or candidate_ahead_count <= 0:
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
    ahead_counts: dict[str, int | GitCommandFailure],
) -> int:
    if parent_branch == base_branch:
        return branch_ahead_count

    parent_ahead_count = ahead_counts[parent_branch]
    if isinstance(parent_ahead_count, GitCommandFailure):
        return branch_ahead_count
    return branch_ahead_count - parent_ahead_count
