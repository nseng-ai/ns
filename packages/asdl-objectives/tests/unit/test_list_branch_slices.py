from __future__ import annotations

import pytest

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import GitCommandFailure
from asdl_objectives.list_branch_slices import (
    ObjectiveBranchSlice,
    build_objective_branch_slices,
)


def test_branch_slice_root_branch_uses_base_parent() -> None:
    git = FakeGitGateway(
        commit_count_by_range={"master..feat/a": 3},
    )

    assert build_objective_branch_slices(
        git,
        local_branches=("master", "feat/a"),
        base_branch="master",
    ) == (
        ObjectiveBranchSlice(
            branch="feat/a",
            parent_branch="master",
            range_spec="master..feat/a",
            slice_commits=3,
        ),
    )


def test_branch_slice_child_branch_uses_nearest_local_ancestor() -> None:
    git = FakeGitGateway(
        ancestors={("feat/a", "feat/b")},
        commit_count_by_range={
            "master..feat/a": 2,
            "master..feat/b": 3,
            "feat/a..feat/b": 1,
        },
    )

    slices = build_objective_branch_slices(
        git,
        local_branches=("master", "feat/a", "feat/b"),
        base_branch="master",
    )

    assert _slice_for(slices, "feat/b") == ObjectiveBranchSlice(
        branch="feat/b",
        parent_branch="feat/a",
        range_spec="feat/a..feat/b",
        slice_commits=1,
    )


def test_branch_slice_nearest_ancestor_wins_over_lower_ancestor() -> None:
    git = FakeGitGateway(
        ancestors={
            ("feat/a", "feat/b"),
            ("feat/a", "feat/c"),
            ("feat/b", "feat/c"),
        },
        commit_count_by_range={
            "master..feat/a": 2,
            "master..feat/b": 4,
            "master..feat/c": 5,
            "feat/a..feat/b": 2,
            "feat/a..feat/c": 3,
            "feat/b..feat/c": 1,
        },
    )

    slices = build_objective_branch_slices(
        git,
        local_branches=("master", "feat/a", "feat/b", "feat/c"),
        base_branch="master",
    )

    assert _slice_for(slices, "feat/c").parent_branch == "feat/b"
    assert _slice_for(slices, "feat/c").range_spec == "feat/b..feat/c"


def test_branch_slice_same_head_candidates_are_ignored() -> None:
    git = FakeGitGateway(
        ancestors={("feat/same", "feat/child")},
        commit_count_by_range={
            "master..feat/same": 4,
            "master..feat/child": 4,
            "feat/same..feat/child": 0,
        },
    )

    slices = build_objective_branch_slices(
        git,
        local_branches=("master", "feat/same", "feat/child"),
        base_branch="master",
    )

    assert _slice_for(slices, "feat/child") == ObjectiveBranchSlice(
        branch="feat/child",
        parent_branch="master",
        range_spec="master..feat/child",
        slice_commits=4,
    )


def test_branch_slice_candidates_not_ahead_of_base_are_ignored() -> None:
    git = FakeGitGateway(
        ancestors={("feat/stale", "feat/child")},
        commit_count_by_range={
            "master..feat/stale": 0,
            "master..feat/child": 3,
            "feat/stale..feat/child": 1,
        },
    )

    slices = build_objective_branch_slices(
        git,
        local_branches=("master", "feat/stale", "feat/child"),
        base_branch="master",
    )

    assert _slice_for(slices, "feat/child").parent_branch == "master"


def test_branch_slice_parent_discovery_uses_one_base_count_per_branch() -> None:
    git = _CountingGitGateway(
        ancestors={
            ("feat/a", "feat/b"),
            ("feat/a", "feat/c"),
            ("feat/b", "feat/c"),
        },
        commit_count_by_range={
            "master..feat/a": 2,
            "master..feat/b": 4,
            "master..feat/c": 5,
            "feat/a..feat/b": 999,
            "feat/a..feat/c": 999,
            "feat/b..feat/c": 999,
        },
    )

    slices = build_objective_branch_slices(
        git,
        local_branches=("master", "feat/a", "feat/b", "feat/c"),
        base_branch="master",
    )

    assert _slice_for(slices, "feat/c") == ObjectiveBranchSlice(
        branch="feat/c",
        parent_branch="feat/b",
        range_spec="feat/b..feat/c",
        slice_commits=1,
    )
    assert git.counted_ranges == (
        "master..feat/a",
        "master..feat/b",
        "master..feat/c",
    )
    assert git.ancestor_checks == ()


def test_branch_slice_tie_breaks_by_branch_name() -> None:
    git = FakeGitGateway(
        ancestors={
            ("feat/a", "feat/child"),
            ("feat/b", "feat/child"),
        },
        commit_count_by_range={
            "master..feat/a": 2,
            "master..feat/b": 2,
            "master..feat/child": 4,
            "feat/a..feat/child": 1,
            "feat/b..feat/child": 1,
        },
    )

    slices = build_objective_branch_slices(
        git,
        local_branches=("master", "feat/b", "feat/a", "feat/child"),
        base_branch="master",
    )

    assert _slice_for(slices, "feat/child").parent_branch == "feat/a"


def test_branch_slice_final_slice_count_failure_raises_clinkr_failure() -> None:
    git = FakeGitGateway(
        commit_count_by_range={
            "master..feat/a": GitCommandFailure(message="rev-list failed", returncode=128)
        },
    )

    with pytest.raises(ClinkrFailure) as exc_info:
        build_objective_branch_slices(
            git,
            local_branches=("master", "feat/a"),
            base_branch="master",
        )

    assert exc_info.value.error_type == "git_slice_count_failed"
    assert exc_info.value.message == "rev-list failed"


class _CountingGitGateway(FakeGitGateway):
    def __init__(
        self,
        *,
        ancestors: set[tuple[str, str]],
        commit_count_by_range: dict[str, int | GitCommandFailure],
    ) -> None:
        super().__init__(ancestors=ancestors, commit_count_by_range=commit_count_by_range)
        self._counted_ranges: list[str] = []
        self._ancestor_checks: list[tuple[str, str]] = []

    def count_commits_in_range(self, range_spec: str) -> int | GitCommandFailure:
        self._counted_ranges.append(range_spec)
        return super().count_commits_in_range(range_spec)

    def is_ancestor(self, maybe_ancestor: str, descendant: str) -> bool:
        self._ancestor_checks.append((maybe_ancestor, descendant))
        return super().is_ancestor(maybe_ancestor, descendant)

    @property
    def counted_ranges(self) -> tuple[str, ...]:
        return tuple(self._counted_ranges)

    @property
    def ancestor_checks(self) -> tuple[tuple[str, str], ...]:
        return tuple(self._ancestor_checks)


def _slice_for(
    slices: tuple[ObjectiveBranchSlice, ...],
    branch: str,
) -> ObjectiveBranchSlice:
    matches = [branch_slice for branch_slice in slices if branch_slice.branch == branch]
    assert len(matches) == 1
    return matches[0]
