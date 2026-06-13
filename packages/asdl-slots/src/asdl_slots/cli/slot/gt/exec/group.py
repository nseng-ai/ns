from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_slots.cli.slot.gt.exec.stack_branches import run_stack_branches


def build_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        hidden=True,
        operations=[run_stack_branches],
        help="Commands for skill/agent invocation.",
    )
