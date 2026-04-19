from __future__ import annotations

import pytest

from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.brmem.gateway import InvalidBranchNameError, InvalidMemoryPathError


def test_fake_brmem_put_then_get_returns_content() -> None:
    gateway = FakeBranchMemoryGateway()

    commit = gateway.put("feat/x", "notes.md", "hello\n")

    assert commit == "fake-0001"
    assert gateway.get("feat/x", "notes.md") == "hello\n"


def test_fake_brmem_get_at_reads_historical_snapshot() -> None:
    gateway = FakeBranchMemoryGateway()

    first_commit = gateway.put("feat/x", "notes.md", "one\n")
    second_commit = gateway.put("feat/x", "notes.md", "two\n")

    assert second_commit == "fake-0002"
    assert gateway.get("feat/x", "notes.md") == "two\n"
    assert gateway.get("feat/x", "notes.md", at=first_commit) == "one\n"


def test_fake_brmem_initial_files_seed_state() -> None:
    gateway = FakeBranchMemoryGateway(initial_files={"feat/x": {"nested/notes.md": "hello\n"}})

    assert gateway.get("feat/x", "nested/notes.md") == "hello\n"


def test_fake_brmem_validates_branch_names() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidBranchNameError):
        gateway.put("feat---x", "notes.md", "hello\n")


def test_fake_brmem_validates_memory_paths() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidMemoryPathError):
        gateway.put("feat/x", "../notes.md", "hello\n")


def test_fake_brmem_tracks_put_calls() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put("feat/x", "notes.md", "one\n")
    gateway.put("feat/x", "docs/plan.txt", "two\n")

    assert gateway._put_calls == [
        ("feat/x", "notes.md", "one\n"),
        ("feat/x", "docs/plan.txt", "two\n"),
    ]
