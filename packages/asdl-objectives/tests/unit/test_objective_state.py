"""Unit tests for archive-backed objective state on ``ObjectiveRepoEntry``."""

from __future__ import annotations

from asdl_objectives.discovery import discover_objectives
from brmem.fake import FakeBranchMemoryGateway


def test_active_namespace_discovers_open_state() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "demo/body.md", "master", "x")

    (entry,) = discover_objectives(gateway, trunk_branch="master")

    assert entry.state == "open"
    assert entry.canonical_present is True


def test_archive_namespace_discovers_closed_state() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives-archive", "demo/body.md", "master", "x")
    gateway.put("objectives-archive", "demo/.closed", "master", '{"schema":1,"closed_at":"t"}\n')

    (entry,) = discover_objectives(
        gateway,
        trunk_branch="master",
        namespace="objectives-archive",
        state="closed",
    )

    assert entry.state == "closed"
    assert entry.canonical_present is True


def test_active_closed_marker_does_not_make_objective_closed() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "demo/body.md", "master", "x")
    gateway.put("objectives", "demo/.closed", "master", '{"schema":1,"closed_at":"t"}\n')

    (entry,) = discover_objectives(gateway, trunk_branch="master")

    assert entry.state == "open"
    assert entry.canonical_present is True


def test_archive_marker_only_has_no_canonical_body() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives-archive", "demo/.closed", "master", '{"schema":1,"closed_at":"t"}\n')

    (entry,) = discover_objectives(
        gateway,
        trunk_branch="master",
        namespace="objectives-archive",
        state="closed",
    )

    assert entry.state == "closed"
    assert entry.canonical_present is False
