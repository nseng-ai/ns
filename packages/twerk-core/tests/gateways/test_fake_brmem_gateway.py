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


def test_fake_brmem_list_empty_for_unknown_branch() -> None:
    gateway = FakeBranchMemoryGateway()

    assert gateway.list("feat/x") == []


def test_fake_brmem_list_returns_sorted_paths() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put("feat/x", "z.md", "z\n")
    gateway.put("feat/x", "a.md", "a\n")
    gateway.put("feat/x", "m.md", "m\n")

    assert gateway.list("feat/x") == ["a.md", "m.md", "z.md"]


def test_fake_brmem_list_at_historical_sha() -> None:
    gateway = FakeBranchMemoryGateway()

    first_commit = gateway.put("feat/x", "a.md", "one\n")
    gateway.put("feat/x", "b.md", "two\n")

    assert gateway.list("feat/x") == ["a.md", "b.md"]
    assert gateway.list("feat/x", at=first_commit) == ["a.md"]


def test_fake_brmem_list_at_unknown_sha_returns_empty() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/x", "a.md", "one\n")

    assert gateway.list("feat/x", at="does-not-exist") == []


def test_fake_brmem_list_rejects_empty_branch_name() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidBranchNameError):
        gateway.list("")
