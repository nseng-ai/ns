"""Tests for FakeWorkbranchGitGateway."""

import pytest

from twerk_core.workbranch.testing import FakeWorkbranchGitGateway


def test_fake_workbranch_git_create_tracks_creation() -> None:
    fake = FakeWorkbranchGitGateway()

    fake.create_branch_at_head("feat/x")

    assert fake._created_branches == ["feat/x"]


def test_fake_workbranch_git_create_errors_on_duplicate() -> None:
    fake = FakeWorkbranchGitGateway(existing_branches={"feat/x"})

    with pytest.raises(ValueError, match="branch already exists"):
        fake.create_branch_at_head("feat/x")


def test_fake_workbranch_git_get_current_branch_returns_configured_value() -> None:
    fake = FakeWorkbranchGitGateway(current_branch="feat/x")

    assert fake.get_current_branch() == "feat/x"


def test_fake_workbranch_git_get_current_branch_returns_none_when_detached() -> None:
    fake = FakeWorkbranchGitGateway(current_branch=None)

    assert fake.get_current_branch() is None


def test_fake_workbranch_git_branch_exists_updates_after_create() -> None:
    fake = FakeWorkbranchGitGateway()

    assert fake.branch_exists("feat/x") is False

    fake.create_branch_at_head("feat/x")

    assert fake.branch_exists("feat/x") is True
