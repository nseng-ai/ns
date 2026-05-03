from __future__ import annotations

from pathlib import Path

from asdl_slots.inventory import SlotInventory, SlotRecord
from asdl_slots.lifecycle import build_init_plan, build_resize_plan


def _record(n: int, branch: str | None = None) -> SlotRecord:
    return SlotRecord(
        slot_name=f"slot-{n:02d}",
        slot_number=n,
        path=Path(f"/wt/slot-{n:02d}"),
        branch=branch,
    )


def _inventory(*records: SlotRecord) -> SlotInventory:
    return SlotInventory(records=tuple(sorted(records, key=lambda r: r.slot_number)))


def test_init_plan_creates_one_through_n() -> None:
    assert build_init_plan(3).create == (1, 2, 3)


def test_init_plan_size_one() -> None:
    assert build_init_plan(1).create == (1,)


def test_resize_grow_from_empty_yields_full_range() -> None:
    plan = build_resize_plan(_inventory(), 3)

    assert plan.create == (1, 2, 3)
    assert plan.remove == ()


def test_resize_grow_fills_gaps_then_extends() -> None:
    plan = build_resize_plan(_inventory(_record(1), _record(3)), 4)

    assert plan.create == (2, 4)
    assert plan.remove == ()


def test_resize_grow_no_gaps_only_extends() -> None:
    plan = build_resize_plan(_inventory(_record(1), _record(2)), 4)

    assert plan.create == (3, 4)
    assert plan.remove == ()


def test_resize_same_size_no_op() -> None:
    plan = build_resize_plan(_inventory(_record(1), _record(2)), 2)

    assert plan.create == ()
    assert plan.remove == ()


def test_resize_same_size_with_gap_is_still_no_op() -> None:
    # Inventory size 2 with a numeric gap; target=2 should not compact.
    plan = build_resize_plan(_inventory(_record(1), _record(3)), 2)

    assert plan.create == ()
    assert plan.remove == ()


def test_resize_shrink_removes_highest_first() -> None:
    plan = build_resize_plan(
        _inventory(_record(1), _record(2), _record(3), _record(4)),
        2,
    )

    assert plan.create == ()
    assert tuple(r.slot_number for r in plan.remove) == (3, 4)


def test_resize_shrink_with_gap_keeps_low_numbered() -> None:
    plan = build_resize_plan(_inventory(_record(1), _record(3), _record(5)), 2)

    assert plan.create == ()
    assert tuple(r.slot_number for r in plan.remove) == (5,)


def test_resize_shrink_returns_full_records() -> None:
    plan = build_resize_plan(
        _inventory(_record(1), _record(2, branch="feat/x")),
        1,
    )

    assert len(plan.remove) == 1
    removed = plan.remove[0]
    assert removed.slot_number == 2
    assert removed.branch == "feat/x"
    assert removed.path == Path("/wt/slot-02")
