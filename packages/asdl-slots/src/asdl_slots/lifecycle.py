"""Pure planners for `slot init` and `slot resize`."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_slots.inventory import SlotInventory, SlotRecord

MIN_POOL_SIZE = 1
MAX_POOL_SIZE = 99


@dataclass(frozen=True)
class InitPlan:
    create: tuple[int, ...]


@dataclass(frozen=True)
class ResizePlan:
    create: tuple[int, ...]
    remove: tuple[SlotRecord, ...]


def build_init_plan(target_size: int) -> InitPlan:
    return InitPlan(create=tuple(range(1, target_size + 1)))


def build_resize_plan(inventory: SlotInventory, target_size: int) -> ResizePlan:
    if target_size == inventory.pool_size:
        return ResizePlan(create=(), remove=())
    if target_size > inventory.pool_size:
        existing = {record.slot_number for record in inventory.records}
        needed = target_size - inventory.pool_size
        create: list[int] = []
        candidate = 1
        while len(create) < needed:
            if candidate not in existing:
                create.append(candidate)
            candidate += 1
        return ResizePlan(create=tuple(create), remove=())
    sorted_records = sorted(inventory.records, key=lambda r: r.slot_number)
    return ResizePlan(create=(), remove=tuple(sorted_records[target_size:]))
