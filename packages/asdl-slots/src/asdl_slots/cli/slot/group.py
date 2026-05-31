from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_slots.cli.slot.checkout import run_checkout_slot
from asdl_slots.cli.slot.completion import build_completion_group
from asdl_slots.cli.slot.free import run_free_slot
from asdl_slots.cli.slot.goto import run_goto_slot
from asdl_slots.cli.slot.gt.group import build_gt_group
from asdl_slots.cli.slot.init import run_init_slots
from asdl_slots.cli.slot.list import run_list_slots
from asdl_slots.cli.slot.resize import run_resize_slots
from asdl_slots.cli.slot.shell import build_shell_group


def build_slot_group() -> ClinkrGroup:
    group = ClinkrGroup(
        name="slot",
        help="Manage the pool of Git-worktree-backed slots.",
        operations=[
            run_checkout_slot,
            run_free_slot,
            run_goto_slot,
            run_init_slots,
            run_list_slots,
            run_resize_slots,
        ],
    )
    group.add_command(build_completion_group())
    group.add_command(build_gt_group())
    group.add_command(build_shell_group())
    return group
