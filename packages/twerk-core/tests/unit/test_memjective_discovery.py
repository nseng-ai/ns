from __future__ import annotations

from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.memjective.discovery import (
    BranchPresence,
    MemjectiveRepoEntry,
    body_key,
    discover_memjectives,
    group_memjective_entries,
    notes_key,
    roadmap_key,
    slug_for_key,
)


def _entries(gateway: FakeBranchMemoryGateway) -> list:
    return gateway.list_entries(namespace="memjectives")


def test_slug_for_key_strips_trailing_filename() -> None:
    assert slug_for_key("widget/body.md") == "widget"
    assert slug_for_key("widget/roadmap.md") == "widget"
    assert slug_for_key("widget/notes.md") == "widget"
    assert slug_for_key("no-suffix") == "no-suffix"


def test_file_key_helpers() -> None:
    assert body_key("widget") == "widget/body.md"
    assert roadmap_key("widget") == "widget/roadmap.md"
    assert notes_key("widget") == "widget/notes.md"


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
    assert result[0].files == ("body.md",)
    assert result[0].seed_present is False
    assert [bp.branch for bp in result[0].branches] == ["b1", "b2", "b3"]


def test_groups_multiple_files_under_one_slug() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "a/body.md", "master", "body")
    gateway.put("memjectives", "a/roadmap.md", "master", "roadmap")
    gateway.put("memjectives", "a/notes.md", "feat/x", "notes")

    result = discover_memjectives(gateway)

    assert len(result) == 1
    assert result[0].slug == "a"
    assert result[0].files == ("body.md", "notes.md", "roadmap.md")
    assert result[0].seed_present is True
    assert [bp.branch for bp in result[0].branches] == ["feat/x"]


def test_seed_only_memjective_has_no_branches() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "orphan/body.md", "master", "x")

    result = discover_memjectives(gateway)

    assert result == (
        MemjectiveRepoEntry(
            slug="orphan",
            files=("body.md",),
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


def test_deleted_branches_marked_when_branch_validator_provided() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "s/body.md", "live", "x")
    gateway.put("memjectives", "s/body.md", "dead", "x")

    result = discover_memjectives(gateway, is_branch_alive={"live"}.__contains__)

    assert result[0].branches == (
        BranchPresence(branch="dead", deleted=True),
        BranchPresence(branch="live", deleted=False),
    )
    assert result[0].live_branch_count == 1
    assert result[0].deleted_branch_count == 1


def test_deleted_is_never_true_when_validator_omitted() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "s/body.md", "anywhere", "x")

    result = discover_memjectives(gateway)

    assert result[0].branches == (BranchPresence(branch="anywhere", deleted=False),)


def test_results_sorted_by_slug() -> None:
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
        BranchPresence(branch="feat/dead", deleted=True),
        BranchPresence(branch="feat/live", deleted=False),
    )
