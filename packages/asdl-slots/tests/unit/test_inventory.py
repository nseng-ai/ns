from __future__ import annotations

from pathlib import Path

from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import WorktreeInfo, WorktreeOccupancy
from asdl_slots.inventory import build_slot_inventory


def _wt(path: Path, branch: str | None) -> WorktreeInfo:
    return WorktreeInfo(path=path, branch=branch, is_bare=False)


def test_empty_returns_zero_records() -> None:
    git = FakeGitGateway(worktrees=())
    inventory = build_slot_inventory(git)
    assert inventory.pool_size == 0
    assert inventory.records == ()


def test_only_main_repo_worktree_is_ignored() -> None:
    git = FakeGitGateway(worktrees=(_wt(Path("/repo"), "main"),))
    inventory = build_slot_inventory(git)
    assert inventory.pool_size == 0
    assert inventory.records == ()


def test_assigned_slot_records_branch() -> None:
    git = FakeGitGateway(
        worktrees=(_wt(Path("/slots/repo/worktrees/slot-01"), "feat/x"),),
    )
    inventory = build_slot_inventory(git)
    assert inventory.pool_size == 1
    record = inventory.records[0]
    assert record.slot_name == "slot-01"
    assert record.slot_number == 1
    assert record.branch == "feat/x"
    assert record.operation is None
    assert record.status == "assigned"
    assert record.is_available is False


def test_available_slot_when_detached() -> None:
    git = FakeGitGateway(
        worktrees=(_wt(Path("/slots/repo/worktrees/slot-01"), None),),
    )
    inventory = build_slot_inventory(git)
    assert inventory.pool_size == 1
    record = inventory.records[0]
    assert record.branch is None
    assert record.operation is None
    assert record.status == "available"
    assert record.is_available is True


def test_mixed_assigned_and_available() -> None:
    git = FakeGitGateway(
        worktrees=(
            _wt(Path("/slots/repo/worktrees/slot-01"), "feat/x"),
            _wt(Path("/slots/repo/worktrees/slot-02"), None),
        ),
    )
    inventory = build_slot_inventory(git)
    assert inventory.pool_size == 2
    assert inventory.records[0].status == "assigned"
    assert inventory.records[0].branch == "feat/x"
    assert inventory.records[1].status == "available"
    assert inventory.records[1].branch is None


def test_records_sorted_when_git_returns_unsorted() -> None:
    git = FakeGitGateway(
        worktrees=(
            _wt(Path("/slots/repo/worktrees/slot-03"), "feat/c"),
            _wt(Path("/slots/repo/worktrees/slot-01"), "feat/a"),
            _wt(Path("/slots/repo/worktrees/slot-02"), "feat/b"),
        ),
    )
    inventory = build_slot_inventory(git)
    assert tuple(r.slot_name for r in inventory.records) == (
        "slot-01",
        "slot-02",
        "slot-03",
    )


def test_manual_gap_surfaces_only_existing_slots() -> None:
    git = FakeGitGateway(
        worktrees=(
            _wt(Path("/slots/repo/worktrees/slot-01"), "feat/a"),
            _wt(Path("/slots/repo/worktrees/slot-03"), "feat/c"),
        ),
    )
    inventory = build_slot_inventory(git)
    assert inventory.pool_size == 2
    assert tuple(r.slot_name for r in inventory.records) == ("slot-01", "slot-03")


def test_non_slot_named_worktrees_filtered() -> None:
    git = FakeGitGateway(
        worktrees=(
            _wt(Path("/repo/foo"), "feat/foo"),
            _wt(Path("/repo/slot-1"), "feat/short"),
            _wt(Path("/repo/slot-aa"), "feat/letters"),
            _wt(Path("/slots/repo/worktrees/slot-01"), "feat/ok"),
        ),
    )
    inventory = build_slot_inventory(git)
    assert inventory.pool_size == 1
    assert inventory.records[0].slot_name == "slot-01"


def test_pool_size_equals_record_count() -> None:
    git = FakeGitGateway(
        worktrees=tuple(
            _wt(Path(f"/slots/repo/worktrees/slot-{n:02d}"), None) for n in range(1, 6)
        ),
    )
    inventory = build_slot_inventory(git)
    assert inventory.pool_size == 5
    assert len(inventory.records) == 5


def test_main_repo_plus_managed_filters_main() -> None:
    git = FakeGitGateway(
        worktrees=(
            _wt(Path("/repo"), "main"),
            _wt(Path("/slots/repo/worktrees/slot-01"), "feat/a"),
            _wt(Path("/slots/repo/worktrees/slot-02"), None),
        ),
    )
    inventory = build_slot_inventory(git)
    assert inventory.pool_size == 2
    assert tuple(r.slot_name for r in inventory.records) == ("slot-01", "slot-02")


def test_detached_rebase_slot_records_held_branch_and_operation() -> None:
    slot_path = Path("/slots/repo/worktrees/slot-07")
    git = FakeGitGateway(
        worktrees=(_wt(slot_path, None),),
        operations_by_path={
            slot_path: WorktreeOccupancy(path=slot_path, branch="feat/rebase", operation="rebase"),
        },
    )

    inventory = build_slot_inventory(git)

    record = inventory.records[0]
    assert record.branch == "feat/rebase"
    assert record.operation == "rebase"
    assert record.status == "assigned"
    assert record.is_available is False


def test_find_occupancy_by_branch_searches_raw_occupancies() -> None:
    external_path = Path("/repo/external")
    git = FakeGitGateway(
        worktrees=(_wt(external_path, None),),
        operations_by_path={
            external_path: WorktreeOccupancy(
                path=external_path,
                branch="feat/external",
                operation="bisect",
            ),
        },
    )

    inventory = build_slot_inventory(git)

    assert inventory.records == ()
    assert inventory.find_occupancy_by_branch("feat/external") == WorktreeOccupancy(
        path=external_path,
        branch="feat/external",
        operation="bisect",
    )
    assert inventory.find_occupancy_by_branch("missing") is None
