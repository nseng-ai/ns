"""Pool-full failure formatting shared by slot lifecycle operations."""

from __future__ import annotations

from asdl_slots.inventory import SlotInventory, SlotRecord
from asdl_slots.lifecycle.outcomes import SlotLifecycleFailure


def assigned_slot_records(inventory: SlotInventory) -> tuple[SlotRecord, ...]:
    return tuple(record for record in inventory.records if record.branch is not None)


def pool_full_failure(
    assigned: tuple[SlotRecord, ...],
    *,
    action: str,
) -> SlotLifecycleFailure:
    if assigned:
        details = "\n".join(assigned_slot_detail(record) for record in assigned)
        message = f"Pool is full. Currently assigned:\n{details}\nFree a slot before {action}."
    else:
        message = (
            f"Pool is full (no slots available). Run `slot init` or `slot resize` before {action}."
        )
    return SlotLifecycleFailure(error_type="pool_full", message=message)


def assigned_slot_detail(record: SlotRecord) -> str:
    suffix = ""
    if record.operation is not None:
        suffix = f" ({record.operation} in progress)"
    return f"  {record.slot_name} -> {record.branch}{suffix}"
