from __future__ import annotations

import pytest

from twerk_core.brmem.gateway import parse_entry_ref


def test_parse_entry_ref_parses_base_snapshot_locator() -> None:
    entry = parse_entry_ref("refs/brmem/base/feat---x:scratchpad")

    assert entry is not None
    assert entry.namespace is None
    assert entry.branch == "feat/x"
    assert entry.key == "scratchpad"
    assert entry.ref_name == "refs/brmem/base/feat---x:scratchpad"


def test_parse_entry_ref_parses_base_snapshot_with_nested_key() -> None:
    entry = parse_entry_ref("refs/brmem/base/feat---x:plan/plan.md")

    assert entry is not None
    assert entry.namespace is None
    assert entry.key == "plan/plan.md"
    assert entry.branch == "feat/x"


def test_parse_entry_ref_parses_namespaced_snapshot_locator() -> None:
    entry = parse_entry_ref("refs/brmem/ns/workbr/feat---x:plan.md")

    assert entry is not None
    assert entry.namespace == "workbr"
    assert entry.branch == "feat/x"
    assert entry.key == "plan.md"


def test_parse_entry_ref_parses_namespaced_snapshot_with_nested_key() -> None:
    entry = parse_entry_ref("refs/brmem/ns/memjectives/feat---x:slug/body.md")

    assert entry is not None
    assert entry.namespace == "memjectives"
    assert entry.key == "slug/body.md"
    assert entry.branch == "feat/x"


@pytest.mark.parametrize(
    "locator",
    [
        "",
        "refs/heads/main",
        "refs/brmem/",
        "refs/brmem/base",
        "refs/brmem/base/",
        "refs/brmem/base/feat---x",  # snapshot ref without key
        "refs/brmem/base/feat---x:",  # empty key
        "refs/brmem/base/feat---x/extra:key",  # extra path segments before ':'
        "refs/brmem/ns",
        "refs/brmem/ns/",
        "refs/brmem/ns/onlytwo",
        "refs/brmem/ns/workbr/feat---x",  # snapshot ref without key
        "refs/brmem/ns/workbr/feat---x/extra:key",  # extra path segments
        "refs/brmem/brs/feat---legacy:plan",
        "refs/brmem/other/feat---x:plan",
    ],
)
def test_parse_entry_ref_returns_none_for_garbage(locator: str) -> None:
    assert parse_entry_ref(locator) is None
