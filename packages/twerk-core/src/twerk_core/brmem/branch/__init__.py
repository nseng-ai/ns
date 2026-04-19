"""Branch-level brmem operations."""

from twerk_core.brmem.branch.check import run_check_branch
from twerk_core.brmem.check_registration import add_check_operation
from twerk_core.clinkr.group import ClinkrGroup, clinkr_group


@clinkr_group(name="branch", help="Branch-level brmem operations.")
def branch() -> ClinkrGroup:
    group = ClinkrGroup("branch", help="Branch-level brmem operations.")
    add_check_operation(group, run_check_branch)
    return group
