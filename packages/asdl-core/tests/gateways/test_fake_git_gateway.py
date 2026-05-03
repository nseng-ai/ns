from __future__ import annotations

from pathlib import Path

from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure, RestructuredFile


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
