from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup
from twerk_slots.cli.slot.checkout import run_checkout_slot
from twerk_slots.cli.slot.completion import build_completion_group
from twerk_slots.cli.slot.free import run_free_slot
from twerk_slots.cli.slot.gc import run_slot_gc
from twerk_slots.cli.slot.goto import run_goto_slot
from twerk_slots.cli.slot.gt.group import build_gt_group
from twerk_slots.cli.slot.list import run_list_slots


def build_slot_group() -> ClinkrGroup:
    group = ClinkrGroup(
        name="slot",
        help="Manage worktree pool slots.",
        operations=[
            run_checkout_slot,
            run_free_slot,
            run_slot_gc,
            run_goto_slot,
            run_list_slots,
        ],
    )
    group.add_command(build_completion_group())
    group.add_command(build_gt_group())
    return group
