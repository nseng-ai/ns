from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup
from twerk_slots.cli.slot.gt.down import run_gt_down
from twerk_slots.cli.slot.gt.free_stack import run_gt_free_stack
from twerk_slots.cli.slot.gt.land import run_gt_land
from twerk_slots.cli.slot.gt.up import run_gt_up


def build_gt_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="gt",
        help="Graphite-aware slot commands.",
        operations=[
            run_gt_up,
            run_gt_down,
            run_gt_land,
            run_gt_free_stack,
        ],
    )
