from __future__ import annotations

import pytest

from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.brmem.gateway import (
    BrmemCopyConflictError,
    InvalidBranchNameError,
    InvalidNamespaceError,
)
from twerk_core.brmem.key_validation import InvalidKeyError


def test_fake_brmem_put_then_get_returns_content() -> None:
    gateway = FakeBranchMemoryGateway()

    commit = gateway.put("workbr", "plan", "feat/x", "hello\n")

    assert commit == "fake-0001"
    assert gateway.get("workbr", "plan", "feat/x") == "hello\n"


def test_fake_brmem_get_at_reads_historical_snapshot() -> None:
    gateway = FakeBranchMemoryGateway()

    first_commit = gateway.put("workbr", "plan", "feat/x", "one\n")
    second_commit = gateway.put("workbr", "plan", "feat/x", "two\n")

    assert second_commit == "fake-0002"
    assert gateway.get("workbr", "plan", "feat/x") == "two\n"
    assert gateway.get("workbr", "plan", "feat/x", at=first_commit) == "one\n"


def test_fake_brmem_initial_entries_seed_state() -> None:
    gateway = FakeBranchMemoryGateway(
        initial_entries={("workbr", "plan/plan.md", "feat/x"): "hello\n"}
    )

    assert gateway.get("workbr", "plan/plan.md", "feat/x") == "hello\n"


def test_fake_brmem_put_preserves_sibling_key_entries() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put("workbr", "plan/a.md", "feat/x", "a\n")
    gateway.put("workbr", "plan/b.md", "feat/x", "b\n")

    assert gateway.get("workbr", "plan/a.md", "feat/x") == "a\n"
    assert gateway.get("workbr", "plan/b.md", "feat/x") == "b\n"


def test_fake_brmem_validates_branch_names() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidBranchNameError):
        gateway.put("workbr", "plan", "feat---x", "hello\n")


def test_fake_brmem_validates_namespace() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidNamespaceError):
        gateway.put("", "plan", "feat/x", "hello\n")
    with pytest.raises(InvalidNamespaceError):
        gateway.put("ns/with/slash", "plan", "feat/x", "hello\n")


def test_fake_brmem_validates_key() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidKeyError):
        gateway.put("workbr", "", "feat/x", "hello\n")
    with pytest.raises(InvalidKeyError):
        gateway.put("workbr", "/abs", "feat/x", "hello\n")
    with pytest.raises(InvalidKeyError):
        gateway.put("workbr", "../escape", "feat/x", "hello\n")


def test_fake_brmem_allows_separator_in_keys() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put("workbr", "a---b", "feat/x", "hello\n")

    assert gateway.get("workbr", "a---b", "feat/x") == "hello\n"


def test_fake_brmem_allows_slashes_in_keys() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put("workbr", "plan/plan.md", "feat/x", "hello\n")

    assert gateway.get("workbr", "plan/plan.md", "feat/x") == "hello\n"


def test_fake_brmem_tracks_put_calls() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put("workbr", "plan", "feat/x", "one\n")
    gateway.put("workbr", "plan/docs.txt", "feat/x", "two\n")

    assert gateway._put_calls == [
        ("workbr", "plan", "feat/x", "one\n"),
        ("workbr", "plan/docs.txt", "feat/x", "two\n"),
    ]


def test_fake_brmem_check_returns_diagnostic_at_head() -> None:
    gateway = FakeBranchMemoryGateway()
    last = gateway.put("workbr", "plan", "feat/x", "hello\n")

    diagnostic = gateway.check("workbr", "plan", "feat/x")

    assert diagnostic is not None
    assert diagnostic.head_sha == last
    assert diagnostic.size_bytes == 6
    assert diagnostic.blob_sha == f"blob-{last}"


def test_fake_brmem_check_returns_none_for_missing_entry() -> None:
    gateway = FakeBranchMemoryGateway()

    assert gateway.check("workbr", "plan", "feat/x") is None


def test_fake_brmem_check_at_historical_sha() -> None:
    gateway = FakeBranchMemoryGateway()
    first_commit = gateway.put("workbr", "plan", "feat/x", "one\n")
    gateway.put("workbr", "plan", "feat/x", "two-and-three\n")

    diagnostic = gateway.check("workbr", "plan", "feat/x", at=first_commit)

    assert diagnostic is not None
    assert diagnostic.size_bytes == 4
    assert diagnostic.head_sha == first_commit


def test_fake_brmem_check_at_unknown_sha_returns_none() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("workbr", "plan", "feat/x", "hello\n")

    assert gateway.check("workbr", "plan", "feat/x", at="does-not-exist") is None


def test_fake_brmem_list_entries_no_filters_returns_all_sorted() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("workbr", "plan", "feat/x", "a\n")
    gateway.put("workbr", "plan", "feat/y", "a\n")
    gateway.put("objectives", "obj-1", "feat/x", "a\n")

    entries = gateway.list_entries()

    assert [(e.namespace, e.key, e.branch) for e in entries] == [
        ("objectives", "obj-1", "feat/x"),
        ("workbr", "plan", "feat/x"),
        ("workbr", "plan", "feat/y"),
    ]
    assert entries[0].ref_name == "refs/brmem/ns/objectives/feat---x/obj-1"


def test_fake_brmem_list_entries_filters_by_namespace() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("workbr", "plan", "feat/x", "a\n")
    gateway.put("objectives", "obj-1", "feat/x", "a\n")

    entries = gateway.list_entries(namespace="workbr")

    assert [(e.namespace, e.key, e.branch) for e in entries] == [("workbr", "plan", "feat/x")]


def test_fake_brmem_list_entries_filters_by_key_and_branch() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("workbr", "plan", "feat/x", "a\n")
    gateway.put("workbr", "notes", "feat/x", "a\n")
    gateway.put("workbr", "plan", "feat/y", "a\n")

    entries = gateway.list_entries(key="plan", branch="feat/y")

    assert [(e.namespace, e.key, e.branch) for e in entries] == [("workbr", "plan", "feat/y")]


def test_fake_brmem_list_entries_matches_keys_with_slashes() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("workbr", "plan/a.md", "feat/x", "a\n")
    gateway.put("workbr", "plan/b.md", "feat/x", "b\n")

    entries = gateway.list_entries(key="plan/a.md")

    assert [(e.namespace, e.key, e.branch) for e in entries] == [
        ("workbr", "plan/a.md", "feat/x"),
    ]


def test_fake_brmem_list_entries_rejects_malformed_filters() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidBranchNameError):
        gateway.list_entries(branch="")
    with pytest.raises(InvalidNamespaceError):
        gateway.list_entries(namespace="ns/with/slash")


def test_fake_brmem_base_namespace_round_trip() -> None:
    gateway = FakeBranchMemoryGateway()

    commit = gateway.put(None, "scratchpad", "feat/x", "hello\n")

    assert commit == "fake-0001"
    assert gateway.get(None, "scratchpad", "feat/x") == "hello\n"

    diagnostic = gateway.check(None, "scratchpad", "feat/x")
    assert diagnostic is not None
    assert diagnostic.size_bytes == 6


def test_fake_brmem_base_and_namespaced_entries_do_not_collide() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put(None, "scratchpad", "feat/x", "base\n")
    gateway.put("workbr", "scratchpad", "feat/x", "ns\n")

    assert gateway.get(None, "scratchpad", "feat/x") == "base\n"
    assert gateway.get("workbr", "scratchpad", "feat/x") == "ns\n"

    entries = gateway.list_entries()
    assert [(e.namespace, e.ref_name) for e in entries] == [
        (None, "refs/brmem/base/feat---x/scratchpad"),
        ("workbr", "refs/brmem/ns/workbr/feat---x/scratchpad"),
    ]


def test_fake_brmem_copy_entries_copies_every_key_without_prefix() -> None:
    gateway = FakeBranchMemoryGateway()
    source_body = gateway.put("memjectives", "foo/body.md", "master", "body\n")
    source_roadmap = gateway.put("memjectives", "foo/roadmap.md", "master", "road\n")
    gateway.put("memjectives", "bar/body.md", "master", "other\n")

    copied = gateway.copy_entries(
        namespace="memjectives",
        from_branch="master",
        to_branch="feat/x",
    )

    assert [(e.key, e.branch) for e in copied] == [
        ("bar/body.md", "feat/x"),
        ("foo/body.md", "feat/x"),
        ("foo/roadmap.md", "feat/x"),
    ]
    # Destination entries reuse source commit SHAs.
    assert gateway.check("memjectives", "foo/body.md", "feat/x") is not None
    assert gateway.check("memjectives", "foo/body.md", "feat/x").head_sha == source_body
    assert gateway.check("memjectives", "foo/roadmap.md", "feat/x").head_sha == source_roadmap


def test_fake_brmem_copy_entries_empty_source_returns_empty_tuple() -> None:
    gateway = FakeBranchMemoryGateway()

    copied = gateway.copy_entries(
        namespace="memjectives",
        from_branch="master",
        to_branch="feat/x",
    )

    assert copied == ()


def test_fake_brmem_copy_entries_requires_overwrite_on_conflict() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "foo/body.md", "master", "source\n")
    gateway.put("memjectives", "foo/body.md", "feat/x", "existing\n")

    with pytest.raises(BrmemCopyConflictError) as excinfo:
        gateway.copy_entries(
            namespace="memjectives",
            from_branch="master",
            to_branch="feat/x",
        )

    assert [entry.key for entry in excinfo.value.conflicts] == ["foo/body.md"]
    # Source content on feat/x must be untouched by the failed copy.
    assert gateway.get("memjectives", "foo/body.md", "feat/x") == "existing\n"


def test_fake_brmem_copy_entries_overwrite_replaces_destination() -> None:
    gateway = FakeBranchMemoryGateway()
    source_sha = gateway.put("memjectives", "foo/body.md", "master", "source\n")
    gateway.put("memjectives", "foo/body.md", "feat/x", "existing\n")

    copied = gateway.copy_entries(
        namespace="memjectives",
        from_branch="master",
        to_branch="feat/x",
        overwrite=True,
    )

    assert [e.key for e in copied] == ["foo/body.md"]
    assert gateway.check("memjectives", "foo/body.md", "feat/x").head_sha == source_sha


def test_fake_brmem_copy_entries_validates_branch_names() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidBranchNameError):
        gateway.copy_entries(
            namespace="memjectives",
            from_branch="feat---x",
            to_branch="feat/y",
        )
    with pytest.raises(InvalidBranchNameError):
        gateway.copy_entries(
            namespace="memjectives",
            from_branch="feat/x",
            to_branch="feat---y",
        )
    with pytest.raises(InvalidNamespaceError):
        gateway.copy_entries(
            namespace="ns/with/slash",
            from_branch="feat/x",
            to_branch="feat/y",
        )
