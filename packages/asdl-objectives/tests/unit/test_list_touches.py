from __future__ import annotations

import pytest

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import GitCommandFailure, PathChangeTouch, PathTouch
from asdl_objectives.list_branch_inventory import ObjectiveBranchInventory
from asdl_objectives.list_branch_slices import ObjectiveBranchSlice
from asdl_objectives.list_touches import (
    build_objective_touch_index,
    objective_slug_from_path,
)


def test_objective_slug_from_path_extracts_slug() -> None:
    assert objective_slug_from_path(".asdl/objectives/alpha/objective.md") == "alpha"
    assert objective_slug_from_path(".asdl/objectives/alpha/updates/progress.md") == "alpha"
    assert objective_slug_from_path(".asdl/objectives") is None
    assert objective_slug_from_path(".asdl/objectives/alpha") is None
    assert objective_slug_from_path("other/alpha/objective.md") is None


def test_build_objective_touch_index_keeps_newest_touch_per_slug() -> None:
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="new-alpha",
                    committed_iso="2026-05-20T11:00:00-04:00",
                    paths=(".asdl/objectives/alpha/updates/progress.md",),
                ),
                PathChangeTouch(
                    oid="older-alpha",
                    committed_iso="2026-05-20T10:00:00-04:00",
                    paths=(".asdl/objectives/alpha/objective.md",),
                ),
                PathChangeTouch(
                    oid="beta",
                    committed_iso="2026-05-20T09:00:00-04:00",
                    paths=(
                        ".asdl/objectives/beta/objective.md",
                        ".asdl/objectives/beta/closed.md",
                    ),
                ),
            ),
        }
    )

    index = build_objective_touch_index(
        git,
        status_source_branch="master",
        branch_slices=(),
        projected_slugs=("alpha", "beta"),
        inventory=ObjectiveBranchInventory(records_by_branch={"master": {"alpha": "open"}}),
    )

    assert index.source_touches == {
        "alpha": PathTouch(oid="new-alpha", committed_iso="2026-05-20T11:00:00-04:00"),
        "beta": PathTouch(oid="beta", committed_iso="2026-05-20T09:00:00-04:00"),
    }


def test_build_objective_touch_index_indexes_branch_slice_touches() -> None:
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (),
            ("master..feat/a", ".asdl/objectives"): (
                PathChangeTouch(
                    oid="a-alpha",
                    committed_iso="2026-05-20T10:00:00-04:00",
                    paths=(".asdl/objectives/alpha/objective.md",),
                ),
                PathChangeTouch(
                    oid="a-beta",
                    committed_iso="2026-05-20T09:00:00-04:00",
                    paths=(".asdl/objectives/beta/objective.md",),
                ),
            ),
        }
    )

    index = build_objective_touch_index(
        git,
        status_source_branch="master",
        branch_slices=(
            ObjectiveBranchSlice(
                branch="feat/a",
                parent_branch="master",
                range_spec="master..feat/a",
                slice_commits=2,
            ),
        ),
        projected_slugs=("alpha", "beta"),
        inventory=ObjectiveBranchInventory(
            records_by_branch={
                "master": {},
                "feat/a": {"alpha": "open"},
            }
        ),
    )

    assert index.slice_touches_by_branch_slug == {
        ("feat/a", "alpha"): PathTouch(
            oid="a-alpha",
            committed_iso="2026-05-20T10:00:00-04:00",
        ),
    }
    assert git.path_touches_under_calls == (
        ("refs/heads/master", ".asdl/objectives"),
        ("master..feat/a", ".asdl/objectives"),
    )


def test_build_objective_touch_index_skips_branch_log_when_no_projected_slugs_present() -> None:
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (),
        }
    )

    build_objective_touch_index(
        git,
        status_source_branch="master",
        branch_slices=(
            ObjectiveBranchSlice(
                branch="feat/a",
                parent_branch="master",
                range_spec="master..feat/a",
                slice_commits=2,
            ),
        ),
        projected_slugs=("alpha",),
        inventory=ObjectiveBranchInventory(records_by_branch={"feat/a": {"beta": "open"}}),
    )

    assert git.path_touches_under_calls == (("refs/heads/master", ".asdl/objectives"),)


def test_build_objective_touch_index_raises_clinkr_failure_on_git_failure() -> None:
    git = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): GitCommandFailure(
                message="bad ref",
                returncode=128,
            ),
        }
    )

    with pytest.raises(ClinkrFailure) as exc_info:
        build_objective_touch_index(
            git,
            status_source_branch="master",
            branch_slices=(),
            projected_slugs=("alpha",),
            inventory=ObjectiveBranchInventory(records_by_branch={}),
        )

    assert exc_info.value.error_type == "git_objective_touches_failed"
    assert exc_info.value.message == "bad ref"
