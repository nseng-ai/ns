from __future__ import annotations

from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.memjective.discovery import (
    BranchPresence,
    MemjectiveRepoEntry,
    discover_memjectives,
    group_memjective_entries,
    key_for_slug,
    slug_for_key,
)


def _entries(gateway: FakeBranchMemoryGateway) -> list:
    return gateway.list_entries(namespace="memjectives")


def test_slug_round_trip() -> None:
    assert slug_for_key("widget/body.md") == "widget"
    assert slug_for_key("no-suffix") == "no-suffix"
    assert key_for_slug("widget") == "widget/body.md"
    assert key_for_slug("already/body.md") == "already/body.md"


def test_empty_repo_produces_empty_result() -> None:
    gateway = FakeBranchMemoryGateway()

    assert discover_memjectives(gateway) == ()


def test_groups_duplicate_snapshots_by_slug() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "a/body.md", "b1", "x")
    gateway.put("memjectives", "a/body.md", "b2", "x")
    gateway.put("memjectives", "a/body.md", "b3", "x")

    result = discover_memjectives(gateway)

    assert len(result) == 1
    assert result[0].slug == "a"
    assert result[0].seed_present is False
    assert [bp.branch for bp in result[0].branches] == ["b1", "b2", "b3"]


def test_seed_only_memjective_has_no_branches() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "orphan/body.md", "master", "x")

    result = discover_memjectives(gateway)

    assert result == (
        MemjectiveRepoEntry(
            slug="orphan",
            key="orphan/body.md",
            seed_present=True,
            branches=(),
        ),
    )


def test_snapshot_only_memjective_has_no_seed() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "detached/body.md", "feat/x", "x")

    result = discover_memjectives(gateway)

    assert result[0].seed_present is False
    assert [bp.branch for bp in result[0].branches] == ["feat/x"]


def test_stale_branches_marked_when_branch_validator_provided() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "s/body.md", "live", "x")
    gateway.put("memjectives", "s/body.md", "dead", "x")

    result = discover_memjectives(gateway, is_branch_alive={"live"}.__contains__)

    assert result[0].branches == (
        BranchPresence(branch="dead", stale=True),
        BranchPresence(branch="live", stale=False),
    )
    assert result[0].live_branch_count == 1
    assert result[0].stale_branch_count == 1


def test_stale_is_never_true_when_validator_omitted() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "s/body.md", "anywhere", "x")

    result = discover_memjectives(gateway)

    assert result[0].branches == (BranchPresence(branch="anywhere", stale=False),)


def test_results_sorted_by_key() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "z/body.md", "master", "x")
    gateway.put("memjectives", "a/body.md", "master", "x")
    gateway.put("memjectives", "m/body.md", "master", "x")

    result = discover_memjectives(gateway)

    assert [m.slug for m in result] == ["a", "m", "z"]


def test_group_memjective_entries_accepts_preloaded_entries() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "x/body.md", "master", "x")
    gateway.put("memjectives", "x/body.md", "feat/live", "x")
    gateway.put("memjectives", "x/body.md", "feat/dead", "x")

    grouped = group_memjective_entries(
        _entries(gateway),
        is_branch_alive={"master", "feat/live"}.__contains__,
    )

    assert grouped[0].seed_present is True
    assert grouped[0].branches == (
        BranchPresence(branch="feat/dead", stale=True),
        BranchPresence(branch="feat/live", stale=False),
    )
