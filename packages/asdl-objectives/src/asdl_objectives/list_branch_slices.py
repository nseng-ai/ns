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
    slices: list[ObjectiveBranchSlice] = []
    for branch in work_branches:
        parent_branch = _slice_parent(
            git,
            branch=branch,
            candidates=work_branches,
            base_branch=base_branch,
        )
        range_spec = f"{parent_branch}..{branch}"
        slice_commits = git.count_commits_in_range(range_spec)
        if isinstance(slice_commits, GitCommandFailure):
            raise ClinkrFailure(
                error_type="git_slice_count_failed",
                message=slice_commits.message,
            )
        slices.append(
            ObjectiveBranchSlice(
                branch=branch,
                parent_branch=parent_branch,
                range_spec=range_spec,
                slice_commits=slice_commits,
            )
        )
    return tuple(slices)


def _slice_parent(
    git: GitGateway,
    *,
    branch: str,
    candidates: tuple[str, ...],
    base_branch: str,
) -> str:
    eligible: list[tuple[int, str]] = []
    for candidate in candidates:
        if candidate == branch:
            continue
        if not _candidate_is_ahead_of_base(git, candidate=candidate, base_branch=base_branch):
            continue
        candidate_distance = git.count_commits_in_range(f"{candidate}..{branch}")
        if isinstance(candidate_distance, GitCommandFailure):
            continue
        if candidate_distance <= 0:
            continue
        if not git.is_ancestor(candidate, branch):
            continue
        eligible.append((candidate_distance, candidate))

    if not eligible:
        return base_branch
    return min(eligible)[1]


def _candidate_is_ahead_of_base(
    git: GitGateway,
    *,
    candidate: str,
    base_branch: str,
) -> bool:
    count = git.count_commits_in_range(f"{base_branch}..{candidate}")
    if isinstance(count, GitCommandFailure):
        return False
    return count > 0
