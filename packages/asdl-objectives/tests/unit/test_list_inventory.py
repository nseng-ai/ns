from __future__ import annotations

import pytest

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import GitCommandFailure
from asdl_objectives.list_inventory import (
    ObjectiveBranchInventory,
    branches_to_scan,
    build_objective_branch_inventory,
    objective_statuses_from_paths,
)


def test_objective_statuses_from_paths_ignores_gitkeep() -> None:
    assert objective_statuses_from_paths((".asdl/objectives/.gitkeep",)) == ()


def test_objective_statuses_from_paths_includes_slugs_with_child_files() -> None:
    assert objective_statuses_from_paths((".asdl/objectives/alpha/objective.md",)) == (
        ("alpha", "open"),
    )


def test_objective_statuses_from_paths_ignores_malformed_paths_with_no_child_path() -> None:
    assert objective_statuses_from_paths((".asdl/objectives/alpha",)) == ()


def test_objective_statuses_from_paths_direct_closed_marker_marks_closed() -> None:
    assert objective_statuses_from_paths(
        (
            ".asdl/objectives/alpha/objective.md",
            ".asdl/objectives/alpha/closed.md",
        )
    ) == (("alpha", "closed"),)


def test_objective_statuses_from_paths_nested_closed_marker_does_not_close() -> None:
    assert objective_statuses_from_paths(
        (
            ".asdl/objectives/alpha/objective.md",
            ".asdl/objectives/alpha/updates/closed.md",
        )
    ) == (("alpha", "open"),)


def test_objective_statuses_from_paths_returns_sorted_slugs() -> None:
    assert objective_statuses_from_paths(
        (
            ".asdl/objectives/zeta/objective.md",
            ".asdl/objectives/alpha/objective.md",
        )
    ) == (("alpha", "open"), ("zeta", "open"))


def test_branches_to_scan_includes_all_local_branches() -> None:
    assert branches_to_scan(
        ("feat/b", "feat/a"),
        base_branch="master",
        status_source_branch=None,
    ) == ("feat/a", "feat/b", "master")


def test_branches_to_scan_includes_base_branch_even_if_missing_from_local_branches() -> None:
    assert branches_to_scan(
        ("feat/a",),
        base_branch="master",
        status_source_branch=None,
    ) == ("feat/a", "master")


def test_branches_to_scan_includes_status_source_branch_when_provided() -> None:
    assert branches_to_scan(
        ("feat/a",),
        base_branch="master",
        status_source_branch="detached-source",
    ) == ("detached-source", "feat/a", "master")


def test_branches_to_scan_returns_sorted_tuple() -> None:
    assert branches_to_scan(
        ("z", "a"),
        base_branch="m",
        status_source_branch="b",
    ) == ("a", "b", "m", "z")


def test_branches_to_scan_handles_no_status_source_branch() -> None:
    assert branches_to_scan((), base_branch="master", status_source_branch=None) == ("master",)


def test_objective_branch_inventory_slugs_on_branch_returns_sorted_slugs() -> None:
    inventory = ObjectiveBranchInventory(
        records_by_branch={"feat/a": {"zeta": "open", "alpha": "closed"}}
    )

    assert inventory.slugs_on_branch("feat/a") == ("alpha", "zeta")


def test_inventory_slugs_on_branch_returns_empty_tuple_for_unknown_branch() -> None:
    inventory = ObjectiveBranchInventory(records_by_branch={})

    assert inventory.slugs_on_branch("missing") == ()


def test_objective_branch_inventory_status_on_branch_returns_status_for_present_slug() -> None:
    inventory = ObjectiveBranchInventory(records_by_branch={"feat/a": {"alpha": "closed"}})

    assert inventory.status_on_branch("feat/a", "alpha") == "closed"


def test_inventory_status_on_branch_returns_none_for_missing_slug_or_branch() -> None:
    inventory = ObjectiveBranchInventory(records_by_branch={"feat/a": {"alpha": "open"}})

    assert inventory.status_on_branch("feat/a", "missing") is None
    assert inventory.status_on_branch("missing", "alpha") is None


def test_objective_branch_inventory_branch_has_slug_returns_boolean() -> None:
    inventory = ObjectiveBranchInventory(records_by_branch={"feat/a": {"alpha": "open"}})

    assert inventory.branch_has_slug("feat/a", "alpha") is True
    assert inventory.branch_has_slug("feat/a", "missing") is False
    assert inventory.branch_has_slug("missing", "alpha") is False


def test_build_objective_branch_inventory_caches_by_objective_tree_oid() -> None:
    git = FakeGitGateway(
        tree_oid_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): "tree-a",
            ("refs/heads/feat/same", ".asdl/objectives"): "tree-a",
            ("refs/heads/feat/other", ".asdl/objectives"): "tree-b",
        },
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/other", ".asdl/objectives"): (
                ".asdl/objectives/beta/objective.md",
                ".asdl/objectives/beta/closed.md",
            ),
        },
    )

    inventory = build_objective_branch_inventory(
        git,
        ("master", "feat/same", "feat/other"),
    )

    assert inventory.records_by_branch == {
        "master": {"alpha": "open"},
        "feat/same": {"alpha": "open"},
        "feat/other": {"beta": "closed"},
    }
    assert git.tree_oids_at_refs_calls == (
        (
            (
                "refs/heads/master",
                "refs/heads/feat/same",
                "refs/heads/feat/other",
            ),
            ".asdl/objectives",
        ),
    )
    assert git.list_tracked_paths_at_ref_calls == (
        ("refs/heads/master", ".asdl/objectives"),
        ("refs/heads/feat/other", ".asdl/objectives"),
    )


def test_build_objective_branch_inventory_missing_tree_maps_to_empty_records() -> None:
    git = FakeGitGateway(
        tree_oid_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): None,
        },
    )

    inventory = build_objective_branch_inventory(git, ("master",))

    assert inventory.records_by_branch == {"master": {}}
    assert git.list_tracked_paths_at_ref_calls == ()


def test_build_objective_branch_inventory_raises_clinkr_failure_on_tree_oid_failure() -> None:
    git = FakeGitGateway(
        tree_oid_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): GitCommandFailure(
                message="fatal: unknown ref",
                returncode=128,
            )
        }
    )

    with pytest.raises(ClinkrFailure) as exc_info:
        build_objective_branch_inventory(git, ("master",))

    assert exc_info.value.error_type == "git_objective_tree_oid_failed"
    assert exc_info.value.message == "fatal: unknown ref"


def test_build_objective_branch_inventory_raises_clinkr_failure_on_path_list_failure() -> None:
    git = FakeGitGateway(
        tree_oid_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): "tree-a",
        },
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): GitCommandFailure(
                message="fatal: ls-tree failed",
                returncode=128,
            )
        },
    )

    with pytest.raises(ClinkrFailure) as exc_info:
        build_objective_branch_inventory(git, ("master",))

    assert exc_info.value.error_type == "git_list_objective_paths_failed"
    assert exc_info.value.message == "fatal: ls-tree failed"
