from __future__ import annotations

from pathlib import Path

from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure, LocalBranchTip, RestructuredFile


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
