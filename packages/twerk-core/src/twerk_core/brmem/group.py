"""Clinkr group factory for the ``brmem`` package."""

from twerk_core.brmem.check import run_check_branch_memory
from twerk_core.brmem.get import run_get_branch_memory
from twerk_core.brmem.list import run_list_branch_memory
from twerk_core.brmem.put import run_put_branch_memory
from twerk_core.clinkr.format_flag import add_format_operation
from twerk_core.clinkr.group import ClinkrGroup, clinkr_group


@clinkr_group(name="brmem", help="Manage branch-scoped memory stored in git refs.")
def brmem() -> ClinkrGroup:
    from twerk_core.brmem.branch.group import branch as build_branch_group

    group = ClinkrGroup(
        operations=[
            run_get_branch_memory,
            run_list_branch_memory,
        ]
    )
    add_format_operation(group, run_check_branch_memory, add_legacy_json_alias=True)
    add_format_operation(group, run_put_branch_memory, add_legacy_json_alias=True)
    group.add_command(build_branch_group())
    return group
