"""Explicit builder for the `brmem` CLI group."""

from twerk_core.brmem.check_artifact import run_check_artifact
from twerk_core.brmem.check_entry import run_check_entry
from twerk_core.brmem.check_registration import add_check_operation
from twerk_core.brmem.get import run_get_artifact
from twerk_core.brmem.list import run_list_entries
from twerk_core.brmem.list_artifacts import run_list_artifacts
from twerk_core.brmem.put import run_put_artifact
from twerk_core.clinkr.group import ClinkrGroup


def build_brmem_group() -> ClinkrGroup:
    group = ClinkrGroup(
        name="brmem",
        help="Manage branch-scoped memory stored in git refs.",
        operations=[
            run_put_artifact,
            run_get_artifact,
            run_list_entries,
            run_list_artifacts,
        ],
    )
    add_check_operation(group, run_check_entry)
    add_check_operation(group, run_check_artifact)
    return group
