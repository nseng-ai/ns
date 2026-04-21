"""Explicit builder for the `brmem` CLI group."""

from twerk_core.brmem.check import run_check
from twerk_core.brmem.get import run_get
from twerk_core.brmem.list import run_list_entries
from twerk_core.brmem.put import run_put
from twerk_core.clinkr.group import ClinkrGroup


def build_brmem_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="brmem",
        help="Manage branch-scoped memory stored in git refs.",
        operations=[
            run_put,
            run_get,
            run_list_entries,
            run_check,
        ],
    )
