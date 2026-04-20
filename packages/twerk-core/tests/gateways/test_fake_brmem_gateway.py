from __future__ import annotations

import pytest

from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.brmem.gateway import (
    InvalidArtifactPathError,
    InvalidBranchNameError,
    InvalidKeyError,
    InvalidNamespaceError,
)


def test_fake_brmem_put_then_get_returns_content() -> None:
    gateway = FakeBranchMemoryGateway()

    commit = gateway.put_artifact("workbr", "plan", "feat/x", "notes.md", "hello\n")

    assert commit == "fake-0001"
    assert gateway.get_artifact("workbr", "plan", "feat/x", "notes.md") == "hello\n"


def test_fake_brmem_get_at_reads_historical_snapshot() -> None:
    gateway = FakeBranchMemoryGateway()

    first_commit = gateway.put_artifact("workbr", "plan", "feat/x", "notes.md", "one\n")
    second_commit = gateway.put_artifact("workbr", "plan", "feat/x", "notes.md", "two\n")

    assert second_commit == "fake-0002"
    assert gateway.get_artifact("workbr", "plan", "feat/x", "notes.md") == "two\n"
    assert gateway.get_artifact("workbr", "plan", "feat/x", "notes.md", at=first_commit) == "one\n"


def test_fake_brmem_initial_entries_seed_state() -> None:
    gateway = FakeBranchMemoryGateway(
        initial_entries={("workbr", "plan", "feat/x"): {"nested/notes.md": "hello\n"}}
    )

    assert gateway.get_artifact("workbr", "plan", "feat/x", "nested/notes.md") == "hello\n"


def test_fake_brmem_put_preserves_sibling_artifacts() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "b.md", "b\n")

    assert gateway.list_artifacts("workbr", "plan", "feat/x") == ["a.md", "b.md"]
    assert gateway.get_artifact("workbr", "plan", "feat/x", "a.md") == "a\n"


def test_fake_brmem_validates_branch_names() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidBranchNameError):
        gateway.put_artifact("workbr", "plan", "feat---x", "notes.md", "hello\n")


def test_fake_brmem_validates_namespace() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidNamespaceError):
        gateway.put_artifact("", "plan", "feat/x", "notes.md", "hello\n")
    with pytest.raises(InvalidNamespaceError):
        gateway.put_artifact("ns/with/slash", "plan", "feat/x", "notes.md", "hello\n")
    with pytest.raises(InvalidNamespaceError):
        gateway.put_artifact("brs", "plan", "feat/x", "notes.md", "hello\n")


def test_fake_brmem_validates_key() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidKeyError):
        gateway.put_artifact("workbr", "", "feat/x", "notes.md", "hello\n")
    with pytest.raises(InvalidKeyError):
        gateway.put_artifact("workbr", "a/b", "feat/x", "notes.md", "hello\n")


def test_fake_brmem_validates_artifact_paths() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidArtifactPathError):
        gateway.put_artifact("workbr", "plan", "feat/x", "../notes.md", "hello\n")


def test_fake_brmem_tracks_put_calls() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put_artifact("workbr", "plan", "feat/x", "notes.md", "one\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "docs/plan.txt", "two\n")

    assert gateway._put_calls == [
        ("workbr", "plan", "feat/x", "notes.md", "one\n"),
        ("workbr", "plan", "feat/x", "docs/plan.txt", "two\n"),
    ]


def test_fake_brmem_list_artifacts_empty_for_unknown_entry() -> None:
    gateway = FakeBranchMemoryGateway()

    assert gateway.list_artifacts("workbr", "plan", "feat/x") == []


def test_fake_brmem_list_artifacts_returns_sorted_paths() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put_artifact("workbr", "plan", "feat/x", "z.md", "z\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "m.md", "m\n")

    assert gateway.list_artifacts("workbr", "plan", "feat/x") == ["a.md", "m.md", "z.md"]


def test_fake_brmem_list_artifacts_at_historical_sha() -> None:
    gateway = FakeBranchMemoryGateway()

    first_commit = gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "one\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "b.md", "two\n")

    assert gateway.list_artifacts("workbr", "plan", "feat/x") == ["a.md", "b.md"]
    assert gateway.list_artifacts("workbr", "plan", "feat/x", at=first_commit) == ["a.md"]


def test_fake_brmem_list_artifacts_at_unknown_sha_returns_empty() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "one\n")

    assert gateway.list_artifacts("workbr", "plan", "feat/x", at="does-not-exist") == []


def test_fake_brmem_check_entry_head_and_count() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    last = gateway.put_artifact("workbr", "plan", "feat/x", "b.md", "b\n")

    diagnostic = gateway.check_entry("workbr", "plan", "feat/x")

    assert diagnostic is not None
    assert diagnostic.head_sha == last
    assert diagnostic.artifact_count == 2


def test_fake_brmem_check_entry_returns_none_for_missing_entry() -> None:
    gateway = FakeBranchMemoryGateway()

    assert gateway.check_entry("workbr", "plan", "feat/x") is None


def test_fake_brmem_check_artifact_returns_diagnostic() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "notes.md", "hello\n")

    diagnostic = gateway.check_artifact("workbr", "plan", "feat/x", "notes.md")

    assert diagnostic is not None
    assert diagnostic.size_bytes == 6
    assert diagnostic.last_commit_sha == "fake-0001"


def test_fake_brmem_check_artifact_missing_returns_none() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "notes.md", "hello\n")

    assert gateway.check_artifact("workbr", "plan", "feat/x", "missing.md") is None


def test_fake_brmem_list_entries_no_filters_returns_all_sorted() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    gateway.put_artifact("workbr", "plan", "feat/y", "a.md", "a\n")
    gateway.put_artifact("objectives", "obj-1", "feat/x", "a.md", "a\n")

    entries = gateway.list_entries()

    assert [(e.namespace, e.key, e.branch) for e in entries] == [
        ("objectives", "obj-1", "feat/x"),
        ("workbr", "plan", "feat/x"),
        ("workbr", "plan", "feat/y"),
    ]
    assert entries[0].ref_name == "refs/brmem/objectives/obj-1/feat---x"


def test_fake_brmem_list_entries_filters_by_namespace() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    gateway.put_artifact("objectives", "obj-1", "feat/x", "a.md", "a\n")

    entries = gateway.list_entries(namespace="workbr")

    assert [(e.namespace, e.key, e.branch) for e in entries] == [("workbr", "plan", "feat/x")]


def test_fake_brmem_list_entries_filters_by_key_and_branch() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    gateway.put_artifact("workbr", "notes", "feat/x", "a.md", "a\n")
    gateway.put_artifact("workbr", "plan", "feat/y", "a.md", "a\n")

    entries = gateway.list_entries(key="plan", branch="feat/y")

    assert [(e.namespace, e.key, e.branch) for e in entries] == [("workbr", "plan", "feat/y")]


def test_fake_brmem_list_entries_rejects_malformed_filters() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidBranchNameError):
        gateway.list_entries(branch="")
    with pytest.raises(InvalidNamespaceError):
        gateway.list_entries(namespace="brs")
