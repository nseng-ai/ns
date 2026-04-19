"""Explicit builder for the `brmem` CLI group."""

from twerk_core.brmem.branch.group import build_branch_group
from twerk_core.brmem.check import run_check_branch_memory
from twerk_core.brmem.check_registration import add_check_operation
from twerk_core.brmem.get import run_get_branch_memory
from twerk_core.brmem.list import run_list_branch_memory
from twerk_core.brmem.put import run_put_branch_memory
from twerk_core.clinkr.group import ClinkrGroup


def build_brmem_group() -> ClinkrGroup:
    group = ClinkrGroup(
        name="brmem",
        help="Manage branch-scoped memory stored in git refs.",
        operations=[
            run_put_branch_memory,
            run_get_branch_memory,
            run_list_branch_memory,
        ],
    )
    add_check_operation(group, run_check_branch_memory)
    group.add_command(build_branch_group())
    return group
