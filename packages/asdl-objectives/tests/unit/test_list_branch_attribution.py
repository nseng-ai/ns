from __future__ import annotations

from pathlib import Path

from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import GitCommandFailure
from asdl_objectives.list_branch_attribution import (
    MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS,
    ObjectiveBranchAttribution,
    build_objective_branch_attribution,
)
from asdl_objectives.testing import change_touch


def test_branch_attribution_empty_slugs_avoids_git_calls(tmp_path: Path) -> None:
    git = FakeGitGateway(repo_root=tmp_path, branches=("master", "feat/a"), trunk_branch="master")

    result = build_objective_branch_attribution(git, trunk_branch="master", slugs=frozenset())

    assert result == ObjectiveBranchAttribution(updated_branches_by_slug={})
    assert git.list_local_branch_tips_calls == ()
    assert git.tree_oids_at_refs_calls == ()
    assert git.path_touches_under_calls == ()


def test_branch_attribution_no_local_non_trunk_branches_returns_empty_tuples(
    tmp_path: Path,
) -> None:
    git = FakeGitGateway(repo_root=tmp_path, branches=("master",), trunk_branch="master")

    result = build_objective_branch_attribution(
        git,
        trunk_branch="master",
        slugs=frozenset({"alpha", "beta"}),
    )

    assert result == ObjectiveBranchAttribution(
        updated_branches_by_slug={"alpha": (), "beta": ()},
    )
    assert git.list_local_branch_tips_calls == (None,)
    assert git.tree_oids_at_refs_calls == ()
    assert git.path_touches_under_calls == ()


def test_branch_attribution_prefilters_trees_before_path_walks(tmp_path: Path) -> None:
    root_path = ".asdl/objectives"
    git = FakeGitGateway(
        repo_root=tmp_path,
        branches=("feat/same-tree", "feat/beta", "master", "feat/branch-only", "feat/alpha"),
        trunk_branch="master",
        tree_oid_by_ref_path={
            ("master", root_path): "trunk-tree",
            ("feat/alpha", root_path): "alpha-tree",
            ("feat/beta", root_path): "beta-tree",
            ("feat/branch-only", root_path): "branch-only-tree",
            ("feat/same-tree", root_path): "trunk-tree",
        },
        path_change_touches_by_ref_path={
            ("master..feat/alpha", root_path): (
                change_touch("alpha-touch", paths=(".asdl/objectives/alpha/objective.md",)),
            ),
            ("master..feat/beta", root_path): (
                change_touch("beta-touch", paths=(".asdl/objectives/beta/objective.md",)),
            ),
            ("master..feat/branch-only", root_path): (
                change_touch(
                    "branch-only-touch",
                    paths=(".asdl/objectives/branch-only/objective.md",),
                ),
            ),
        },
    )

    result = build_objective_branch_attribution(
        git,
        trunk_branch="master",
        slugs=frozenset({"alpha", "beta"}),
    )

    assert result == ObjectiveBranchAttribution(
        updated_branches_by_slug={"alpha": ("feat/alpha",), "beta": ("feat/beta",)},
    )
    assert git.tree_oids_at_refs_calls == (
        (
            ("master", "feat/alpha", "feat/beta", "feat/branch-only", "feat/same-tree"),
            root_path,
        ),
    )
    assert git.path_touches_under_calls == (
        ("master..feat/alpha", root_path),
        ("master..feat/beta", root_path),
        ("master..feat/branch-only", root_path),
    )


def test_branch_attribution_sorts_newest_tips_first_with_unknown_last(tmp_path: Path) -> None:
    root_path = ".asdl/objectives"
    git = FakeGitGateway(
        repo_root=tmp_path,
        branches=("master", "a-older", "z-newer", "m-unknown"),
        trunk_branch="master",
        tree_oid_by_ref_path={
            ("master", root_path): "trunk-tree",
            ("a-older", root_path): "older-tree",
            ("z-newer", root_path): "newer-tree",
            ("m-unknown", root_path): "unknown-tree",
        },
        path_change_touches_by_ref_path={
            ("master..a-older", root_path): (
                change_touch("older-touch", paths=(".asdl/objectives/alpha/objective.md",)),
            ),
            ("master..z-newer", root_path): (
                change_touch("newer-touch", paths=(".asdl/objectives/alpha/objective.md",)),
            ),
            ("master..m-unknown", root_path): (
                change_touch("unknown-touch", paths=(".asdl/objectives/alpha/objective.md",)),
            ),
        },
        branch_head_iso_by_branch={
            "master": "2026-05-01T00:00:00+00:00",
            "a-older": "2026-05-02T00:00:00+00:00",
            "z-newer": "2026-05-03T00:00:00+00:00",
        },
    )

    result = build_objective_branch_attribution(
        git,
        trunk_branch="master",
        slugs=frozenset({"alpha"}),
    )

    assert result == ObjectiveBranchAttribution(
        updated_branches_by_slug={"alpha": ("z-newer", "a-older", "m-unknown")},
    )
    assert git.path_touches_under_calls == (
        ("master..z-newer", root_path),
        ("master..a-older", root_path),
        ("master..m-unknown", root_path),
    )


def test_branch_attribution_caps_after_prefilter_and_surfaces_truncation(tmp_path: Path) -> None:
    root_path = ".asdl/objectives"
    changed_branches = tuple(
        f"feat/{index:02d}" for index in range(MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS)
    )
    overflow_branch = f"feat/{MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS:02d}"
    same_tree_branch = "feat/same-tree"
    git = FakeGitGateway(
        repo_root=tmp_path,
        branches=("master", same_tree_branch, *changed_branches, overflow_branch),
        trunk_branch="master",
        tree_oid_by_ref_path={
            ("master", root_path): "trunk-tree",
            (same_tree_branch, root_path): "trunk-tree",
            **{(branch, root_path): f"{branch}-tree" for branch in changed_branches},
            (overflow_branch, root_path): f"{overflow_branch}-tree",
        },
        path_change_touches_by_ref_path={
            ("master..feat/00", root_path): (
                change_touch("included-touch", paths=(".asdl/objectives/alpha/objective.md",)),
            ),
            (f"master..{overflow_branch}", root_path): (
                change_touch("overflow-touch", paths=(".asdl/objectives/alpha/objective.md",)),
            ),
        },
    )

    result = build_objective_branch_attribution(
        git,
        trunk_branch="master",
        slugs=frozenset({"alpha"}),
    )

    assert result == ObjectiveBranchAttribution(
        updated_branches_by_slug={"alpha": ("feat/00",)},
        truncated=True,
    )
    assert git.tree_oids_at_refs_calls == (
        (("master", *changed_branches, overflow_branch, same_tree_branch), root_path),
    )
    assert git.path_touches_under_calls == tuple(
        (f"master..{branch}", root_path) for branch in changed_branches
    )


def test_branch_attribution_propagates_tree_and_path_failures(tmp_path: Path) -> None:
    root_path = ".asdl/objectives"
    tree_failure = GitCommandFailure(message="tree failed", returncode=128)
    tree_git = FakeGitGateway(
        repo_root=tmp_path,
        branches=("master", "feat/broken"),
        trunk_branch="master",
        tree_oid_by_ref_path={("feat/broken", root_path): tree_failure},
    )

    tree_result = build_objective_branch_attribution(
        tree_git,
        trunk_branch="master",
        slugs=frozenset({"alpha"}),
    )

    assert tree_result == tree_failure

    path_failure = GitCommandFailure(message="log failed", returncode=128)
    path_git = FakeGitGateway(
        repo_root=tmp_path,
        branches=("master", "feat/broken"),
        trunk_branch="master",
        tree_oid_by_ref_path={
            ("master", root_path): "trunk-tree",
            ("feat/broken", root_path): "branch-tree",
        },
        path_change_touches_by_ref_path={("master..feat/broken", root_path): path_failure},
    )

    path_result = build_objective_branch_attribution(
        path_git,
        trunk_branch="master",
        slugs=frozenset({"alpha"}),
    )

    assert path_result == path_failure
