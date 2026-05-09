"""Explicit builder for the `brmem` CLI group."""

from asdl_core.clinkr.group import ClinkrGroup
from brmem.check import run_check
from brmem.copy import run_copy
from brmem.delete import run_delete
from brmem.exec.resolve_prompt import run_resolve_prompt
from brmem.export import run_export
from brmem.get import run_get
from brmem.list import run_list_entries
from brmem.put import run_put


def build_brmem_group() -> ClinkrGroup:
    exec_group = ClinkrGroup(
        name="exec",
        help="Commands for use by skills (not interactive users).",
        operations=[run_resolve_prompt],
        hidden=True,
    )
    outer = ClinkrGroup(
        name="brmem",
        help="Manage Branch Memory Entries stored in git refs.",
        operations=[
            run_put,
            run_get,
            run_delete,
            run_list_entries,
            run_check,
            run_copy,
            run_export,
        ],
    )
    outer.add_command(exec_group)
    return outer
