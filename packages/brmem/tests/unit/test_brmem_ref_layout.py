from __future__ import annotations

import pytest

from brmem.ref_layout import (
    EntryRef,
    InvalidBranchNameError,
    InvalidNamespaceError,
    SnapshotRef,
    check_branch_name,
    check_namespace,
    decode_branch_segment,
    encode_branch_segment,
    parse_entry_ref,
    parse_snapshot_ref,
    ref_name_for_entry,
    snapshot_ref_name,
    validate_branch_name,
    validate_namespace,
)


def test_snapshot_ref_name_builds_and_parses_base_ref() -> None:
    ref = snapshot_ref_name(None, "feat/x")

    assert ref == "refs/brmem/base/feat---x"
    assert parse_snapshot_ref(ref) == SnapshotRef(
        namespace=None,
        branch="feat/x",
        ref_name="refs/brmem/base/feat---x",
    )


def test_snapshot_ref_name_builds_and_parses_namespaced_ref() -> None:
    ref = snapshot_ref_name("scratch", "feat/x")

    assert ref == "refs/brmem/ns/scratch/feat---x"
    assert parse_snapshot_ref(ref) == SnapshotRef(
        namespace="scratch",
        branch="feat/x",
        ref_name="refs/brmem/ns/scratch/feat---x",
    )


def test_ref_name_for_entry_builds_and_parses_base_entry_locator() -> None:
    locator = ref_name_for_entry(None, "scratchpad", "feat/x")

    assert locator == "refs/brmem/base/feat---x:scratchpad"
    assert parse_entry_ref(locator) == EntryRef(
        namespace=None,
        key="scratchpad",
        branch="feat/x",
        ref_name="refs/brmem/base/feat---x:scratchpad",
    )


def test_ref_name_for_entry_builds_and_parses_namespaced_entry_locator() -> None:
    locator = ref_name_for_entry("objectives", "slug/body.md", "feat/x")

    assert locator == "refs/brmem/ns/objectives/feat---x:slug/body.md"
    assert parse_entry_ref(locator) == EntryRef(
        namespace="objectives",
        key="slug/body.md",
        branch="feat/x",
        ref_name="refs/brmem/ns/objectives/feat---x:slug/body.md",
    )


def test_parse_entry_ref_preserves_nested_keys_after_colon() -> None:
    entry = parse_entry_ref("refs/brmem/base/feat---x:plans/deep/plan.md")

    assert entry is not None
    assert entry.key == "plans/deep/plan.md"
    assert entry.branch == "feat/x"


@pytest.mark.parametrize(
    "ref",
    [
        "",
        "refs/heads/main",
        "refs/brmem/",
        "refs/brmem/base",
        "refs/brmem/base/",
        "refs/brmem/base/feat---x/extra",
        "refs/brmem/ns",
        "refs/brmem/ns/",
        "refs/brmem/ns/onlytwo",
        "refs/brmem/ns/scratch/feat---x/extra",
        "refs/brmem/brs/feat---legacy",
        "refs/brmem/other/feat---x",
    ],
)
def test_parse_snapshot_ref_returns_none_for_malformed_refs(ref: str) -> None:
    assert parse_snapshot_ref(ref) is None


@pytest.mark.parametrize(
    "locator",
    [
        "",
        "refs/heads/main",
        "refs/brmem/",
        "refs/brmem/base",
        "refs/brmem/base/",
        "refs/brmem/base/feat---x",
        "refs/brmem/base/feat---x:",
        "refs/brmem/base/feat---x/extra:key",
        "refs/brmem/ns",
        "refs/brmem/ns/",
        "refs/brmem/ns/onlytwo",
        "refs/brmem/ns/scratch/feat---x",
        "refs/brmem/ns/scratch/feat---x/extra:key",
        "refs/brmem/brs/feat---legacy:plan",
        "refs/brmem/other/feat---x:plan",
    ],
)
def test_parse_entry_ref_returns_none_for_malformed_locators(locator: str) -> None:
    assert parse_entry_ref(locator) is None


def test_branch_slashes_encode_as_triple_dash() -> None:
    encoded = encode_branch_segment("feat/x/y")

    assert encoded == "feat---x---y"
    assert decode_branch_segment(encoded) == "feat/x/y"


def test_branch_names_containing_triple_dash_are_rejected() -> None:
    message = check_branch_name("feat---x")

    assert message is not None
    assert "cannot be encoded into refs/brmem" in message
    with pytest.raises(InvalidBranchNameError):
        validate_branch_name("feat---x")


def test_empty_branch_name_is_rejected() -> None:
    message = check_branch_name("")

    assert message is not None
    assert "must not be empty" in message
    with pytest.raises(InvalidBranchNameError):
        validate_branch_name("")


def test_namespace_containing_slash_is_rejected() -> None:
    message = check_namespace("bad/ns")

    assert message is not None
    assert "must not contain '/'" in message
    with pytest.raises(InvalidNamespaceError):
        validate_namespace("bad/ns")


def test_empty_namespace_is_rejected() -> None:
    message = check_namespace("")

    assert message is not None
    assert "must not be empty" in message
    with pytest.raises(InvalidNamespaceError):
        validate_namespace("")
