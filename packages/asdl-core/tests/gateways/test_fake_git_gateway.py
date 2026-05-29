from __future__ import annotations

from pathlib import Path

from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import (
    BranchCommitGraph,
    CommitGraphNode,
    DetachedHead,
    GitCommandFailure,
    LocalBranchTip,
    LocalBranchTipRef,
    PathChangeTouch,
    PathTouch,
    RestructuredFile,
)


def test_fake_current_branch_defaults_to_detached_head() -> None:
    gateway = FakeGitGateway()

    assert gateway.get_current_branch(Path("/repo")) == DetachedHead()


def test_fake_current_branch_returns_seeded_outcome() -> None:
    cwd = Path("/repo")
    gateway = FakeGitGateway(current_branch_by_path={cwd: "feature"})

    assert gateway.get_current_branch(cwd) == "feature"


def test_fake_current_branch_returns_seeded_failure() -> None:
    cwd = Path("/repo")
    failure = GitCommandFailure(message="fatal: not a git repository", returncode=128)
    gateway = FakeGitGateway(current_branch_by_path={cwd: failure})

    assert gateway.get_current_branch(cwd) == failure


def test_fake_has_uncommitted_changes_under_defaults_to_false() -> None:
    gateway = FakeGitGateway()

    assert not gateway.has_uncommitted_changes_under(Path("/repo"), ".asdl/objectives/alpha")


def test_fake_has_uncommitted_changes_under_returns_seeded_true() -> None:
    cwd = Path("/repo")
    gateway = FakeGitGateway(
        uncommitted_changes_by_cwd_path={(cwd, ".asdl/objectives/alpha"): True}
    )

    assert gateway.has_uncommitted_changes_under(cwd, ".asdl/objectives/alpha")


def test_fake_has_uncommitted_changes_under_returns_seeded_false() -> None:
    cwd = Path("/repo")
    gateway = FakeGitGateway(
        uncommitted_changes_by_cwd_path={(cwd, ".asdl/objectives/alpha"): False}
    )

    assert not gateway.has_uncommitted_changes_under(cwd, ".asdl/objectives/alpha")


def test_fake_has_uncommitted_changes_under_tracks_calls() -> None:
    cwd = Path("/repo")
    gateway = FakeGitGateway()

    gateway.has_uncommitted_changes_under(cwd, ".asdl/objectives/alpha")
    gateway.has_uncommitted_changes_under(cwd, ".asdl/objectives/beta")

    assert gateway.has_uncommitted_changes_under_calls == (
        (cwd, ".asdl/objectives/alpha"),
        (cwd, ".asdl/objectives/beta"),
    )


def test_fake_restructured_files_default_empty() -> None:
    gateway = FakeGitGateway()

    assert gateway.get_restructured_files(Path("/repo"), "main") == ()


def test_fake_restructured_files_returns_seeded_result() -> None:
    cwd = Path("/repo")
    files = (
        RestructuredFile(
            status="R",
            old_path="old.py",
            new_path="new.py",
            similarity=100,
        ),
    )
    gateway = FakeGitGateway(restructured_files_by_key={(cwd, "main"): files})

    assert gateway.get_restructured_files(cwd, "main") == files


def test_fake_list_directories_at_ref_defaults_to_empty() -> None:
    gateway = FakeGitGateway()

    assert gateway.list_directories_at_ref("refs/heads/feature", ".asdl/objectives") == ()


def test_fake_list_directories_at_ref_returns_seeded_directories() -> None:
    gateway = FakeGitGateway(
        directories_by_ref_path={
            ("refs/heads/feature", ".asdl/objectives"): ("alpha", "beta"),
        }
    )

    assert gateway.list_directories_at_ref("refs/heads/feature", ".asdl/objectives") == (
        "alpha",
        "beta",
    )


def test_fake_path_exists_at_ref_returns_seeded_existence() -> None:
    gateway = FakeGitGateway(
        paths_at_ref={
            ("refs/heads/feature", ".asdl/objectives/alpha/closed.md"),
        }
    )

    assert gateway.path_exists_at_ref(
        "refs/heads/feature",
        ".asdl/objectives/alpha/closed.md",
    )
    assert not gateway.path_exists_at_ref(
        "refs/heads/feature",
        ".asdl/objectives/beta/closed.md",
    )


def test_fake_list_local_branch_tips_returns_sorted_branches_and_seeded_timestamps() -> None:
    gateway = FakeGitGateway(
        branches=("feat/b", "main", "feat/a"),
        branch_head_iso_by_branch={"feat/a": "2026-05-20T10:44:08-04:00"},
    )

    assert gateway.list_local_branch_tips() == (
        LocalBranchTip(name="feat/a", head_iso="2026-05-20T10:44:08-04:00"),
        LocalBranchTip(name="feat/b", head_iso=None),
        LocalBranchTip(name="main", head_iso=None),
    )


def test_fake_delete_local_branch_removes_branch_and_tracks_call() -> None:
    gateway = FakeGitGateway(branches=("main", "feature"))

    result = gateway.delete_local_branch("feature", force=True)

    assert result is None
    assert not gateway.branch_exists("feature")
    assert gateway.branch_exists("main")
    assert gateway.delete_local_branch_calls == (("feature", True),)


def test_fake_delete_local_branch_failure_preserves_branch() -> None:
    failure = GitCommandFailure(message="branch is not fully merged", returncode=1)
    gateway = FakeGitGateway(
        branches=("main", "feature"),
        delete_local_branch_failure_by_branch={"feature": failure},
    )

    result = gateway.delete_local_branch("feature", force=False)

    assert result == failure
    assert gateway.branch_exists("feature")
    assert gateway.delete_local_branch_calls == (("feature", False),)


def test_fake_delete_remote_branch_tracks_call_and_returns_seeded_failure() -> None:
    failure = GitCommandFailure(message="remote rejected", returncode=1)
    gateway = FakeGitGateway(
        delete_remote_branch_failure_by_args={("origin", "feature"): failure},
    )

    result = gateway.delete_remote_branch("origin", "feature")

    assert result == failure
    assert gateway.delete_remote_branch_calls == (("origin", "feature"),)


def test_fake_list_branches_merged_into_returns_branch_and_seeded_ancestors() -> None:
    gateway = FakeGitGateway(
        branches=("main", "feat/base", "feat/child", "feat/sibling"),
        ancestors={
            ("main", "feat/child"),
            ("feat/base", "feat/child"),
        },
    )

    assert gateway.list_branches_merged_into("feat/child") == (
        "feat/base",
        "feat/child",
        "main",
    )


def test_fake_tree_oids_at_refs_returns_seeded_tree_oids() -> None:
    gateway = FakeGitGateway(
        tree_oid_by_ref_path={
            ("refs/heads/feature", ".asdl/objectives"): "tree-a",
            ("refs/heads/empty", ".asdl/objectives"): None,
        }
    )

    assert gateway.tree_oids_at_refs(
        ("refs/heads/feature", "refs/heads/empty"),
        ".asdl/objectives",
    ) == {
        "refs/heads/feature": "tree-a",
        "refs/heads/empty": None,
    }
    assert gateway.tree_oids_at_refs_calls == (
        (("refs/heads/feature", "refs/heads/empty"), ".asdl/objectives"),
    )


def test_fake_tree_oids_at_refs_synthesizes_stable_tree_oid_from_tracked_paths() -> None:
    paths = (".asdl/objectives/alpha/objective.md",)
    gateway = FakeGitGateway(
        tracked_paths_by_ref_path={
            ("refs/heads/a", ".asdl/objectives"): paths,
            ("refs/heads/b", ".asdl/objectives"): paths,
        }
    )

    result = gateway.tree_oids_at_refs(
        ("refs/heads/a", "refs/heads/b", "refs/heads/missing"),
        ".asdl/objectives",
    )

    assert not isinstance(result, GitCommandFailure)
    assert result["refs/heads/a"] == result["refs/heads/b"]
    assert result["refs/heads/missing"] is None


def test_fake_list_tracked_paths_at_ref_defaults_to_empty() -> None:
    gateway = FakeGitGateway()

    assert gateway.list_tracked_paths_at_ref("refs/heads/feature", ".asdl/objectives") == ()


def test_fake_list_tracked_paths_at_ref_returns_seeded_paths() -> None:
    paths = (
        ".asdl/objectives/alpha/objective.md",
        ".asdl/objectives/alpha/updates/progress.md",
    )
    gateway = FakeGitGateway(
        tracked_paths_by_ref_path={("refs/heads/feature", ".asdl/objectives"): paths}
    )

    assert gateway.list_tracked_paths_at_ref("refs/heads/feature", ".asdl/objectives") == paths


def test_fake_list_tracked_paths_at_ref_returns_seeded_failure() -> None:
    failure = GitCommandFailure(message="bad ref", returncode=128)
    gateway = FakeGitGateway(
        tracked_paths_by_ref_path={("refs/heads/feature", ".asdl/objectives"): failure}
    )

    assert gateway.list_tracked_paths_at_ref("refs/heads/feature", ".asdl/objectives") == failure


def test_fake_tracks_read_calls() -> None:
    gateway = FakeGitGateway()

    gateway.list_tracked_paths_at_ref("refs/heads/feature", ".asdl/objectives")
    gateway.path_last_touched("main..feature", ".asdl/objectives/alpha")
    gateway.list_branches_merged_into("feature")
    gateway.count_commits_in_range("main..feature")

    assert gateway.list_tracked_paths_at_ref_calls == (("refs/heads/feature", ".asdl/objectives"),)
    assert gateway.path_last_touched_calls == (("main..feature", ".asdl/objectives/alpha"),)
    assert gateway.list_branches_merged_into_calls == ("feature",)
    assert gateway.count_commits_in_range_calls == ("main..feature",)


def test_fake_path_last_touched_returns_seeded_touch() -> None:
    touch = PathTouch(oid="abc123", committed_iso="2026-05-20T10:44:08-04:00")
    gateway = FakeGitGateway(
        path_touch_by_ref_path={
            ("refs/heads/feature", ".asdl/objectives/alpha"): touch,
        }
    )

    assert gateway.path_last_touched("refs/heads/feature", ".asdl/objectives/alpha") == touch
    assert (
        gateway.file_last_touched_iso("refs/heads/feature", ".asdl/objectives/alpha")
        == "2026-05-20T10:44:08-04:00"
    )


def test_fake_path_last_touched_accepts_revision_range_key() -> None:
    touch = PathTouch(oid="abc123", committed_iso="2026-05-20T10:44:08-04:00")
    gateway = FakeGitGateway(
        path_touch_by_ref_path={
            ("main..feature", ".asdl/objectives/alpha"): touch,
        }
    )

    assert gateway.path_last_touched("main..feature", ".asdl/objectives/alpha") == touch


def test_fake_path_last_touched_falls_back_to_seeded_timestamp() -> None:
    gateway = FakeGitGateway(
        file_last_touched_by_ref_path={
            ("refs/heads/feature", ".asdl/objectives/alpha"): "2026-05-20T10:44:08-04:00",
        }
    )

    assert gateway.path_last_touched("refs/heads/feature", ".asdl/objectives/alpha") == PathTouch(
        oid="refs/heads/feature:.asdl/objectives/alpha",
        committed_iso="2026-05-20T10:44:08-04:00",
    )


def test_fake_path_touches_under_returns_seeded_touches() -> None:
    touch = PathChangeTouch(
        oid="abc123",
        committed_iso="2026-05-20T10:44:08-04:00",
        paths=(".asdl/objectives/alpha/objective.md",),
    )
    gateway = FakeGitGateway(
        path_change_touches_by_ref_path={
            ("main..feature", ".asdl/objectives"): (touch,),
        }
    )

    assert gateway.path_touches_under("main..feature", ".asdl/objectives") == (touch,)
    assert gateway.path_touches_under_calls == (("main..feature", ".asdl/objectives"),)


def test_fake_path_touches_under_synthesizes_from_path_last_touches() -> None:
    gateway = FakeGitGateway(
        path_touch_by_ref_path={
            ("main..feature", ".asdl/objectives/alpha"): PathTouch(
                oid="alpha-oid",
                committed_iso="2026-05-20T10:44:08-04:00",
            ),
            ("main..feature", "other/path"): PathTouch(
                oid="other-oid",
                committed_iso="2026-05-20T11:00:00-04:00",
            ),
        }
    )

    assert gateway.path_touches_under("main..feature", ".asdl/objectives") == (
        PathChangeTouch(
            oid="alpha-oid",
            committed_iso="2026-05-20T10:44:08-04:00",
            paths=(".asdl/objectives/alpha/__fake_touch__",),
        ),
    )


def test_fake_commit_graph_from_base_returns_seeded_graph() -> None:
    graph = BranchCommitGraph(
        base_branch="main",
        branch_tips=(LocalBranchTipRef(branch="feature", oid="b"),),
        commits=(CommitGraphNode(oid="b", parent_oids=("a",)),),
    )
    gateway = FakeGitGateway(
        commit_graph_by_base_branches={
            ("main", ("feature",)): graph,
        }
    )

    assert gateway.commit_graph_from_base(base_branch="main", branches=("feature",)) == graph
    assert gateway.commit_graph_from_base_calls == (("main", ("feature",)),)


def test_fake_commit_graph_from_base_synthesizes_from_counts_and_ancestors() -> None:
    gateway = FakeGitGateway(
        ancestors={("feat/base", "feat/child")},
        commit_count_by_range={
            "main..feat/base": 2,
            "main..feat/child": 3,
            "main..feat/zero": 0,
        },
    )

    graph = gateway.commit_graph_from_base(
        base_branch="main",
        branches=("feat/child", "feat/zero", "feat/base"),
    )

    assert isinstance(graph, BranchCommitGraph)
    assert tuple(tip.branch for tip in graph.branch_tips) == (
        "feat/base",
        "feat/child",
        "feat/zero",
    )
    assert _tip_oid(graph, "feat/base") == "feat/base@2"
    assert _tip_oid(graph, "feat/child") == "feat/child@3"
    assert _tip_oid(graph, "feat/zero") == "feat/zero@base"
    assert _node(graph, "feat/child@3") == CommitGraphNode(
        oid="feat/child@3",
        parent_oids=("feat/base@2",),
    )


def _tip_oid(graph: BranchCommitGraph, branch: str) -> str:
    matches = [tip for tip in graph.branch_tips if tip.branch == branch]
    assert len(matches) == 1
    return matches[0].oid


def _node(graph: BranchCommitGraph, oid: str) -> CommitGraphNode:
    matches = [commit for commit in graph.commits if commit.oid == oid]
    assert len(matches) == 1
    return matches[0]
