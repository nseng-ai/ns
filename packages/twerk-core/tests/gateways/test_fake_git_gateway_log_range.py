"""Tests for ``FakeGitGateway.log_range`` seeding."""

from __future__ import annotations

from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import CommitSummary, GitCommandFailure


def test_fake_log_range_defaults_empty() -> None:
    gateway = FakeGitGateway()

    assert gateway.log_range("master..HEAD") == ()


def test_fake_log_range_returns_seeded_commits() -> None:
    commits = (
        CommitSummary(sha="sha-2", author_iso="2026-04-26T19:00:00+00:00", subject="Second"),
        CommitSummary(sha="sha-1", author_iso="2026-04-26T18:00:00+00:00", subject="First"),
    )
    gateway = FakeGitGateway(commits_by_range={"master..HEAD": commits})

    assert gateway.log_range("master..HEAD") == commits


def test_fake_log_range_returns_seeded_failure() -> None:
    failure = GitCommandFailure(message="fatal: bad revision", returncode=128)
    gateway = FakeGitGateway(log_range_failure=failure)

    assert gateway.log_range("master..HEAD") == failure


def test_fake_log_range_failure_overrides_seeded_commits() -> None:
    failure = GitCommandFailure(message="git log failed", returncode=1)
    gateway = FakeGitGateway(
        commits_by_range={
            "master..HEAD": (
                CommitSummary(sha="sha-1", author_iso="2026-04-26T18:00:00+00:00", subject="First"),
            )
        },
        log_range_failure=failure,
    )

    assert gateway.log_range("master..HEAD") == failure
