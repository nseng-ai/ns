from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_slots.cli.slot.gt.down import run_gt_down
from asdl_slots.cli.slot.gt.exec.group import build_exec_group
from asdl_slots.cli.slot.gt.free_stack import run_gt_free_stack
from asdl_slots.cli.slot.gt.up import run_gt_up


def build_gt_group() -> ClinkrGroup:
    group = ClinkrGroup(
        name="gt",
        help=(
            "Graphite-aware slot commands.\n\n"
            "`slot gt up` and `slot gt down` print/copy cd commands and honor the "
            "opt-in shell integration wrapper."
        ),
        operations=[
            run_gt_up,
            run_gt_down,
            run_gt_free_stack,
        ],
    )
    group.add_command(build_exec_group())
    return group
