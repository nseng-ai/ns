from __future__ import annotations

import pytest

from brmem.fake import EntryKey, FakeBranchMemoryGateway
from brmem.gateway import BrmemCopyConflictError, KeyNotFoundError
from brmem.key_validation import InvalidKeyError
from brmem.ref_layout import BASE_NAMESPACE, InvalidBranchNameError, InvalidNamespaceError
from brmem.validation import InvalidKeyGlobError


def test_fake_brmem_put_then_get_returns_content() -> None:
    gateway = FakeBranchMemoryGateway()

    commit = gateway.put("scratch", "plan", "feat/x", "hello\n")

    assert commit == "fake-0001"
    assert gateway.get("scratch", "plan", "feat/x") == "hello\n"


def test_fake_brmem_get_at_reads_historical_snapshot() -> None:
    gateway = FakeBranchMemoryGateway()

    first_commit = gateway.put("scratch", "plan", "feat/x", "one\n")
    second_commit = gateway.put("scratch", "plan", "feat/x", "two\n")

    assert second_commit == "fake-0002"
    assert gateway.get("scratch", "plan", "feat/x") == "two\n"
    assert gateway.get("scratch", "plan", "feat/x", at=first_commit) == "one\n"


def test_fake_brmem_initial_entries_seed_state() -> None:
    gateway = FakeBranchMemoryGateway(
        initial_entries={
            EntryKey(namespace="scratch", key="plan/plan.md", branch="feat/x"): "hello\n"
        }
    )

    assert gateway.get("scratch", "plan/plan.md", "feat/x") == "hello\n"


def test_fake_brmem_put_preserves_sibling_key_entries() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put("scratch", "plan/a.md", "feat/x", "a\n")
    gateway.put("scratch", "plan/b.md", "feat/x", "b\n")

    assert gateway.get("scratch", "plan/a.md", "feat/x") == "a\n"
    assert gateway.get("scratch", "plan/b.md", "feat/x") == "b\n"


def test_fake_brmem_validates_branch_names() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidBranchNameError):
        gateway.put("scratch", "plan", "feat---x", "hello\n")


def test_fake_brmem_validates_namespace() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidNamespaceError):
        gateway.put("", "plan", "feat/x", "hello\n")
    with pytest.raises(InvalidNamespaceError):
        gateway.put("ns/with/slash", "plan", "feat/x", "hello\n")


def test_fake_brmem_validates_key() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidKeyError):
        gateway.put("scratch", "", "feat/x", "hello\n")
    with pytest.raises(InvalidKeyError):
        gateway.put("scratch", "/abs", "feat/x", "hello\n")
    with pytest.raises(InvalidKeyError):
        gateway.put("scratch", "../escape", "feat/x", "hello\n")


def test_fake_brmem_allows_separator_in_keys() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put("scratch", "a---b", "feat/x", "hello\n")

    assert gateway.get("scratch", "a---b", "feat/x") == "hello\n"


def test_fake_brmem_allows_slashes_in_keys() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put("scratch", "plan/plan.md", "feat/x", "hello\n")

    assert gateway.get("scratch", "plan/plan.md", "feat/x") == "hello\n"


def test_fake_brmem_tracks_put_calls() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put("scratch", "plan", "feat/x", "one\n")
    gateway.put("scratch", "plan/docs.txt", "feat/x", "two\n")

    assert gateway._put_calls == [
        ("scratch", "plan", "feat/x", "one\n"),
        ("scratch", "plan/docs.txt", "feat/x", "two\n"),
    ]


def test_fake_brmem_check_returns_diagnostic_at_head() -> None:
    gateway = FakeBranchMemoryGateway()
    last = gateway.put("scratch", "plan", "feat/x", "hello\n")

    diagnostic = gateway.check("scratch", "plan", "feat/x")

    assert diagnostic is not None
    assert diagnostic.head_sha == last
    assert diagnostic.size_bytes == 6
    assert diagnostic.blob_sha == f"blob-{last}"


def test_fake_brmem_check_returns_none_for_missing_entry() -> None:
    gateway = FakeBranchMemoryGateway()

    assert gateway.check("scratch", "plan", "feat/x") is None


def test_fake_brmem_check_at_historical_sha() -> None:
    gateway = FakeBranchMemoryGateway()
    first_commit = gateway.put("scratch", "plan", "feat/x", "one\n")
    gateway.put("scratch", "plan", "feat/x", "two-and-three\n")

    diagnostic = gateway.check("scratch", "plan", "feat/x", at=first_commit)

    assert diagnostic is not None
    assert diagnostic.size_bytes == 4
    assert diagnostic.head_sha == first_commit


def test_fake_brmem_check_at_unknown_sha_returns_none() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan", "feat/x", "hello\n")

    assert gateway.check("scratch", "plan", "feat/x", at="does-not-exist") is None


def test_fake_brmem_list_entries_no_filters_returns_all_sorted() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan", "feat/x", "a\n")
    gateway.put("scratch", "plan", "feat/y", "a\n")
    gateway.put("notes", "obj-1", "feat/x", "a\n")

    entries = gateway.list_all_entries()

    assert [(e.namespace, e.key, e.branch) for e in entries] == [
        ("notes", "obj-1", "feat/x"),
        ("scratch", "plan", "feat/x"),
        ("scratch", "plan", "feat/y"),
    ]
    assert entries[0].ref_name == "refs/brmem/ns/notes/feat---x:obj-1"


def test_fake_brmem_list_entries_filters_by_namespace() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan", "feat/x", "a\n")
    gateway.put("notes", "obj-1", "feat/x", "a\n")

    entries = gateway.list_entries(namespace="scratch")

    assert [(e.namespace, e.key, e.branch) for e in entries] == [("scratch", "plan", "feat/x")]


def test_fake_brmem_list_entries_filters_by_key_and_branch() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan", "feat/x", "a\n")
    gateway.put("scratch", "notes", "feat/x", "a\n")
    gateway.put("scratch", "plan", "feat/y", "a\n")

    entries = gateway.list_all_entries(key="plan", branch="feat/y")

    assert [(e.namespace, e.key, e.branch) for e in entries] == [("scratch", "plan", "feat/y")]


def test_fake_brmem_list_entries_matches_keys_with_slashes() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan/a.md", "feat/x", "a\n")
    gateway.put("scratch", "plan/b.md", "feat/x", "b\n")

    entries = gateway.list_all_entries(key="plan/a.md")

    assert [(e.namespace, e.key, e.branch) for e in entries] == [
        ("scratch", "plan/a.md", "feat/x"),
    ]


def test_fake_brmem_list_entries_rejects_malformed_filters() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidBranchNameError):
        gateway.list_all_entries(branch="")
    with pytest.raises(InvalidNamespaceError):
        gateway.list_entries(namespace="ns/with/slash")


def test_fake_brmem_base_namespace_round_trip() -> None:
    gateway = FakeBranchMemoryGateway()

    commit = gateway.put(BASE_NAMESPACE, "scratchpad", "feat/x", "hello\n")

    assert commit == "fake-0001"
    assert gateway.get(BASE_NAMESPACE, "scratchpad", "feat/x") == "hello\n"

    diagnostic = gateway.check(BASE_NAMESPACE, "scratchpad", "feat/x")
    assert diagnostic is not None
    assert diagnostic.size_bytes == 6


def test_fake_brmem_base_and_namespaced_entries_do_not_collide() -> None:
    gateway = FakeBranchMemoryGateway()

    gateway.put(BASE_NAMESPACE, "scratchpad", "feat/x", "base\n")
    gateway.put("scratch", "scratchpad", "feat/x", "ns\n")

    assert gateway.get(BASE_NAMESPACE, "scratchpad", "feat/x") == "base\n"
    assert gateway.get("scratch", "scratchpad", "feat/x") == "ns\n"

    entries = gateway.list_all_entries()
    assert [(e.namespace, e.ref_name) for e in entries] == [
        (BASE_NAMESPACE, "refs/brmem/base/feat---x:scratchpad"),
        ("scratch", "refs/brmem/ns/scratch/feat---x:scratchpad"),
    ]


def test_fake_brmem_copy_entries_supports_base_namespace() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(BASE_NAMESPACE, "plan.md", "master", "plan\n")
    source_head = gateway.put(BASE_NAMESPACE, "notes/session.md", "master", "session\n")
    gateway.put("notes", "plan.md", "master", "named\n")

    copied = gateway.copy_entries(
        namespace=BASE_NAMESPACE,
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob=None,
    )

    assert [(e.key, e.ref_name) for e in copied] == [
        ("notes/session.md", "refs/brmem/base/feat---x:notes/session.md"),
        ("plan.md", "refs/brmem/base/feat---x:plan.md"),
    ]
    assert gateway.get(BASE_NAMESPACE, "plan.md", "feat/x") == "plan\n"
    assert gateway.get(BASE_NAMESPACE, "notes/session.md", "feat/x") == "session\n"
    assert gateway.get("notes", "plan.md", "feat/x") is None

    diagnostic = gateway.check(BASE_NAMESPACE, "plan.md", "feat/x")
    assert diagnostic is not None
    assert diagnostic.head_sha == source_head


def test_fake_brmem_copy_entries_base_key_glob_preserves_non_matching_dest_keys() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(BASE_NAMESPACE, "plans/a.md", "master", "a\n")
    gateway.put(BASE_NAMESPACE, "notes/a.md", "master", "notes\n")
    gateway.put(BASE_NAMESPACE, "keep.md", "feat/x", "keep\n")

    copied = gateway.copy_entries(
        namespace=BASE_NAMESPACE,
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob="plans/*",
    )

    assert [e.key for e in copied] == ["plans/a.md"]
    assert gateway.get(BASE_NAMESPACE, "plans/a.md", "feat/x") == "a\n"
    assert gateway.get(BASE_NAMESPACE, "keep.md", "feat/x") == "keep\n"
    assert gateway.get(BASE_NAMESPACE, "notes/a.md", "feat/x") is None


def test_fake_brmem_copy_entries_empty_dest_snapshot_is_not_conflict() -> None:
    gateway = FakeBranchMemoryGateway()
    source_head = gateway.put("notes", "plan.md", "master", "plan\n")
    gateway.put("notes", "temporary.md", "feat/x", "temporary\n")
    gateway.delete("notes", "temporary.md", "feat/x")

    copied = gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob=None,
    )

    assert [e.key for e in copied] == ["plan.md"]
    diagnostic = gateway.check("notes", "plan.md", "feat/x")
    assert diagnostic is not None
    assert diagnostic.head_sha == source_head


def test_fake_brmem_copy_entries_copies_every_key_without_prefix() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("notes", "foo/body.md", "master", "body\n")
    gateway.put("notes", "foo/roadmap.md", "master", "road\n")
    source_head = gateway.put("notes", "bar/body.md", "master", "other\n")

    copied = gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob=None,
    )

    assert [(e.key, e.branch) for e in copied] == [
        ("bar/body.md", "feat/x"),
        ("foo/body.md", "feat/x"),
        ("foo/roadmap.md", "feat/x"),
    ]
    # Destination snapshot IS the source snapshot — every key on feat/x
    # resolves to the same commit as master.
    for key in ("bar/body.md", "foo/body.md", "foo/roadmap.md"):
        diag = gateway.check("notes", key, "feat/x")
        assert diag is not None
        assert diag.head_sha == source_head


def test_fake_brmem_copy_entries_empty_source_returns_empty_tuple() -> None:
    gateway = FakeBranchMemoryGateway()

    copied = gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob=None,
    )

    assert copied == ()


def test_fake_brmem_copy_entries_requires_overwrite_on_conflict() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("notes", "foo/body.md", "master", "source\n")
    gateway.put("notes", "foo/body.md", "feat/x", "existing\n")

    with pytest.raises(BrmemCopyConflictError) as excinfo:
        gateway.copy_entries(
            namespace="notes",
            from_branch="master",
            to_branch="feat/x",
            overwrite=False,
            key_glob=None,
        )

    assert [entry.key for entry in excinfo.value.conflicts] == ["foo/body.md"]
    # Source content on feat/x must be untouched by the failed copy.
    assert gateway.get("notes", "foo/body.md", "feat/x") == "existing\n"


def test_fake_brmem_copy_entries_overwrite_replaces_destination() -> None:
    gateway = FakeBranchMemoryGateway()
    source_sha = gateway.put("notes", "foo/body.md", "master", "source\n")
    gateway.put("notes", "foo/body.md", "feat/x", "existing\n")

    copied = gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=True,
        key_glob=None,
    )

    assert [e.key for e in copied] == ["foo/body.md"]
    diag = gateway.check("notes", "foo/body.md", "feat/x")
    assert diag is not None
    assert diag.head_sha == source_sha


def test_fake_brmem_copy_entries_overwrite_drops_destination_only_keys() -> None:
    """Snapshot-level overwrite replaces the destination entirely — keys that
    exist only on the destination are dropped when the source snapshot wins.
    """
    gateway = FakeBranchMemoryGateway()
    gateway.put("notes", "foo/body.md", "master", "source\n")
    # Destination has an extra key that the source doesn't carry.
    gateway.put("notes", "foo/body.md", "feat/x", "existing\n")
    gateway.put("notes", "foo/notes.md", "feat/x", "dest-only\n")

    gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=True,
        key_glob=None,
    )

    # Destination now matches master exactly — the dest-only key is gone.
    keys = [e.key for e in gateway.list_entries(namespace="notes", branch="feat/x")]
    assert keys == ["foo/body.md"]
    assert gateway.check("notes", "foo/notes.md", "feat/x") is None


def test_fake_brmem_delete_removes_existing_key() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan", "feat/x", "hello\n")

    new_sha = gateway.delete("scratch", "plan", "feat/x")

    assert new_sha == "fake-0002"
    assert gateway.get("scratch", "plan", "feat/x") is None
    assert gateway.check("scratch", "plan", "feat/x") is None


def test_fake_brmem_delete_missing_key_raises() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan", "feat/x", "hello\n")

    with pytest.raises(KeyNotFoundError):
        gateway.delete("scratch", "missing", "feat/x")


def test_fake_brmem_delete_missing_branch_raises() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(KeyNotFoundError):
        gateway.delete("scratch", "plan", "feat/x")


def test_fake_brmem_delete_preserves_sibling_keys() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan/a.md", "feat/x", "a\n")
    gateway.put("scratch", "plan/b.md", "feat/x", "b\n")

    gateway.delete("scratch", "plan/a.md", "feat/x")

    assert gateway.get("scratch", "plan/a.md", "feat/x") is None
    assert gateway.get("scratch", "plan/b.md", "feat/x") == "b\n"


def test_fake_brmem_delete_last_key_leaves_empty_snapshot() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan", "feat/x", "hello\n")

    gateway.delete("scratch", "plan", "feat/x")

    # The snapshot ref still exists (delete is non-idempotent: a second delete
    # on the same key fails) but holds no entries.
    assert gateway.list_entries(namespace="scratch", branch="feat/x") == []
    with pytest.raises(KeyNotFoundError):
        gateway.delete("scratch", "plan", "feat/x")


def test_fake_brmem_delete_validates_inputs() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidBranchNameError):
        gateway.delete("scratch", "plan", "feat---x")
    with pytest.raises(InvalidNamespaceError):
        gateway.delete("ns/with/slash", "plan", "feat/x")


def test_fake_brmem_copy_entries_validates_branch_names() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(InvalidBranchNameError):
        gateway.copy_entries(
            namespace="notes",
            from_branch="feat---x",
            to_branch="feat/y",
            overwrite=False,
            key_glob=None,
        )
    with pytest.raises(InvalidBranchNameError):
        gateway.copy_entries(
            namespace="notes",
            from_branch="feat/x",
            to_branch="feat---y",
            overwrite=False,
            key_glob=None,
        )
    with pytest.raises(InvalidNamespaceError):
        gateway.copy_entries(
            namespace="ns/with/slash",
            from_branch="feat/x",
            to_branch="feat/y",
            overwrite=False,
            key_glob=None,
        )


def _seed_glob_gateway() -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("notes", "foo/body.md", "master", "foo-body\n")
    gateway.put("notes", "foo/sub/x.md", "master", "foo-sub\n")
    gateway.put("notes", "foobar/body.md", "master", "foobar-body\n")
    gateway.put("notes", "bar/body.md", "master", "bar-body\n")
    return gateway


def test_fake_brmem_copy_entries_key_glob_filters_source() -> None:
    gateway = _seed_glob_gateway()

    copied = gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob="foo/*",
    )

    assert sorted(e.key for e in copied) == ["foo/body.md", "foo/sub/x.md"]
    dest_keys = sorted(e.key for e in gateway.list_entries(namespace="notes", branch="feat/x"))
    # foobar/body.md and bar/body.md are not copied — the trailing '/' in
    # the glob anchors the prefix segment.
    assert dest_keys == ["foo/body.md", "foo/sub/x.md"]


def test_fake_brmem_copy_entries_key_glob_zero_match_returns_empty() -> None:
    gateway = _seed_glob_gateway()

    copied = gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob="nope/*",
    )

    assert copied == ()
    assert gateway.list_entries(namespace="notes", branch="feat/x") == []


def test_fake_brmem_copy_entries_key_glob_does_not_match_sibling_prefix() -> None:
    gateway = _seed_glob_gateway()

    gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob="foo/*",
    )

    assert gateway.check("notes", "foobar/body.md", "feat/x") is None


def test_fake_brmem_copy_entries_key_glob_overwrite_preserves_non_matching() -> None:
    gateway = _seed_glob_gateway()
    gateway.put("notes", "foo/body.md", "feat/x", "existing-foo\n")
    gateway.put("notes", "bar/body.md", "feat/x", "existing-bar\n")

    gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=True,
        key_glob="foo/*",
    )

    # Matching dest key was replaced by the source entry.
    assert gateway.get("notes", "foo/body.md", "feat/x") == "foo-body\n"
    # Non-matching dest key survived bit-for-bit.
    assert gateway.get("notes", "bar/body.md", "feat/x") == "existing-bar\n"


def test_fake_brmem_copy_entries_key_glob_conflict_lists_only_matching_dest_keys() -> None:
    gateway = _seed_glob_gateway()
    gateway.put("notes", "foo/body.md", "feat/x", "existing-foo\n")
    gateway.put("notes", "bar/body.md", "feat/x", "existing-bar\n")

    with pytest.raises(BrmemCopyConflictError) as excinfo:
        gateway.copy_entries(
            namespace="notes",
            from_branch="master",
            to_branch="feat/x",
            overwrite=False,
            key_glob="foo/*",
        )

    assert [entry.key for entry in excinfo.value.conflicts] == ["foo/body.md"]
    # Non-matching dest content must survive the aborted copy.
    assert gateway.get("notes", "bar/body.md", "feat/x") == "existing-bar\n"


def test_fake_brmem_copy_entries_rejects_empty_key_glob() -> None:
    gateway = _seed_glob_gateway()

    with pytest.raises(InvalidKeyGlobError):
        gateway.copy_entries(
            namespace="notes",
            from_branch="master",
            to_branch="feat/x",
            overwrite=False,
            key_glob="",
        )
