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


def test_branch_slice_candidate_count_failures_skip_only_that_candidate() -> None:
    failure = GitCommandFailure(message="bad range", returncode=128)
    git = FakeGitGateway(
        ancestors={
            ("feat/bad", "feat/child"),
            ("feat/good", "feat/child"),
        },
        commit_count_by_range={
            "master..feat/bad": 5,
            "master..feat/good": 4,
            "master..feat/child": 6,
            "feat/bad..feat/child": failure,
            "feat/good..feat/child": 2,
        },
    )

    slices = build_objective_branch_slices(
        git,
        local_branches=("master", "feat/bad", "feat/good", "feat/child"),
        base_branch="master",
    )

    assert _slice_for(slices, "feat/child").parent_branch == "feat/good"


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


def _slice_for(
    slices: tuple[ObjectiveBranchSlice, ...],
    branch: str,
) -> ObjectiveBranchSlice:
    matches = [branch_slice for branch_slice in slices if branch_slice.branch == branch]
    assert len(matches) == 1
    return matches[0]
