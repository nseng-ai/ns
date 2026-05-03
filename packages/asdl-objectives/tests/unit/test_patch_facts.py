"""Unit tests for shared branch patch-fact loading."""

from __future__ import annotations

from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import CommitSummary, GitCommandFailure
from asdl_objectives.patch_facts import BranchPatchFacts, load_branch_patch_facts


def _commit(sha: str) -> CommitSummary:
    return CommitSummary(
        sha=sha,
        author_iso="2026-04-26T18:00:00+00:00",
        subject=f"Commit {sha}",
    )


def test_load_branch_patch_facts_aligns_patch_ids_to_commits() -> None:
    commits = (_commit("sha-2"), _commit("sha-1"))
    facts = load_branch_patch_facts(
        FakeGitGateway(
            commits_by_range={"master..HEAD": commits},
            patch_ids_by_range={"master..HEAD": (("sha-2", "pid-2"), ("sha-1", "pid-1"))},
        ),
        "master..HEAD",
        require_patch_ids=False,
    )

    assert isinstance(facts, BranchPatchFacts)
    assert facts == BranchPatchFacts(
        commits=commits,
        pid_by_sha={"sha-2": "pid-2", "sha-1": "pid-1"},
    )
    assert facts.commit_patch_ids == ("pid-2", "pid-1")


def test_load_branch_patch_facts_treats_optional_patch_id_failure_as_unavailable() -> None:
    commits = (_commit("sha-1"),)
    facts = load_branch_patch_facts(
        FakeGitGateway(
            commits_by_range={"master..HEAD": commits},
            patch_ids_failure=GitCommandFailure(message="git patch-id failed", returncode=1),
        ),
        "master..HEAD",
        require_patch_ids=False,
    )

    assert isinstance(facts, BranchPatchFacts)
    assert facts == BranchPatchFacts(commits=commits, pid_by_sha=None)
    assert facts.commit_patch_ids is None


def test_load_branch_patch_facts_empty_range_is_fresh_even_without_patch_ids() -> None:
    facts = load_branch_patch_facts(
        FakeGitGateway(
            commits_by_range={"master..HEAD": ()},
            patch_ids_failure=GitCommandFailure(message="git patch-id failed", returncode=1),
        ),
        "master..HEAD",
        require_patch_ids=False,
    )

    assert isinstance(facts, BranchPatchFacts)
    assert facts == BranchPatchFacts(commits=(), pid_by_sha=None)
    assert facts.commit_patch_ids == ()


def test_load_branch_patch_facts_returns_required_patch_id_failure() -> None:
    failure = GitCommandFailure(message="git patch-id failed", returncode=1)
    result = load_branch_patch_facts(
        FakeGitGateway(
            commits_by_range={"master..HEAD": (_commit("sha-1"),)},
            patch_ids_failure=failure,
        ),
        "master..HEAD",
        require_patch_ids=True,
    )

    assert result == failure
