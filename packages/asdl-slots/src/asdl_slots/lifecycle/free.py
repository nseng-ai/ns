"""Free assigned slots back to the pool."""

from __future__ import annotations

import subprocess
from collections.abc import Sequence

from asdl_slots.context import SlotsCliContext
from asdl_slots.inventory import SlotInventory, build_slot_inventory
from asdl_slots.lifecycle.outcomes import FreedSlot, SlotFreeOutcome, SlotLifecycleFailure


def free_slots(
    slots_ctx: SlotsCliContext,
    slot_names: Sequence[str],
    *,
    preflight_errors: Sequence[str] = (),
    trunk_branch: str | None = None,
) -> SlotFreeOutcome | SlotLifecycleFailure:
    if not slot_names and not preflight_errors:
        return SlotFreeOutcome(freed=())

    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )

    state_errors = _validate_assigned_and_clean(slots_ctx, inventory, slot_names)
    all_errors = (*preflight_errors, *state_errors)
    if all_errors:
        return SlotLifecycleFailure(
            error_type="invalid_slot_args",
            message="\n".join(all_errors),
        )

    trunk = trunk_branch if trunk_branch is not None else slots_ctx.git.get_trunk_branch()
    freed: list[FreedSlot] = []
    for slot_name in slot_names:
        record = inventory.find_by_slot(slot_name)
        if record is None or record.branch is None:
            return SlotLifecycleFailure(
                error_type="slot_not_assigned",
                message=_partial_failure_message(
                    f"{slot_name} is not currently assigned (state changed during free).",
                    freed,
                ),
            )
        if slots_ctx.git.has_uncommitted_changes(record.path):
            return SlotLifecycleFailure(
                error_type="dirty_worktree",
                message=_partial_failure_message(
                    f"{slot_name} has uncommitted changes at {record.path} "
                    f"(state changed during free).",
                    freed,
                ),
            )
        try:
            slots_ctx.git.detach_head(record.path, trunk)
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else str(exc)
            return SlotLifecycleFailure(
                error_type="slot_allocation_error",
                message=_partial_failure_message(
                    f"Failed to detach {slot_name} at {record.path} to {trunk}: {stderr}",
                    freed,
                ),
            )
        freed.append(
            FreedSlot(
                slot_name=record.slot_name,
                branch_name=record.branch,
                worktree_path=record.path,
            )
        )

    return SlotFreeOutcome(freed=tuple(freed))


def _validate_assigned_and_clean(
    slots_ctx: SlotsCliContext,
    inventory: SlotInventory,
    slot_names: Sequence[str],
) -> tuple[str, ...]:
    errors: list[str] = []
    for slot_name in slot_names:
        record = inventory.find_by_slot(slot_name)
        if record is None or record.branch is None:
            errors.append(
                f"{slot_name} is not currently assigned. Run `slot list` to see the pool."
            )
            continue
        if slots_ctx.git.has_uncommitted_changes(record.path):
            errors.append(
                f"{slot_name} has uncommitted changes at {record.path}. "
                f"Commit or stash before freeing."
            )
    return tuple(errors)


def _partial_failure_message(base: str, freed: list[FreedSlot]) -> str:
    if not freed:
        return base
    already = ", ".join(f.slot_name for f in freed)
    return f"{base} Already freed: {already}."
