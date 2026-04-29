"""Unit tests for canonical-closed state on ``ObjectiveRepoEntry``."""

from __future__ import annotations

from brmem.fake import FakeBranchMemoryGateway
from twerk_objectives.discovery import discover_objectives


def test_state_open_when_no_closed_marker() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "demo/body.md", "master", "x")

    (entry,) = discover_objectives(gateway, trunk_branch="master")

    assert entry.state == "open"
    assert entry.canonical_present is True


def test_state_closed_when_marker_on_trunk() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "demo/body.md", "master", "x")
    gateway.put("objectives", "demo/.closed", "master", '{"schema":1,"closed_at":"t"}\n')

    (entry,) = discover_objectives(gateway, trunk_branch="master")

    assert entry.state == "closed"
    assert entry.canonical_present is True


def test_branch_snapshot_closed_marker_is_ignored() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "demo/body.md", "master", "x")
    gateway.put("objectives", "demo/body.md", "feat/x", "x")
    gateway.put("objectives", "demo/.closed", "feat/x", '{"schema":1,"closed_at":"t"}\n')

    (entry,) = discover_objectives(gateway, trunk_branch="master")

    assert entry.state == "open"


def test_canonical_present_false_when_only_closed_on_trunk() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "demo/.closed", "master", '{"schema":1,"closed_at":"t"}\n')

    (entry,) = discover_objectives(gateway, trunk_branch="master")

    assert entry.state == "closed"
    assert entry.canonical_present is False
