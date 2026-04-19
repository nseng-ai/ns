"""Explicit builder for the `brmem branch` CLI group."""

from twerk_core.brmem.branch.check import run_check_branch
from twerk_core.brmem.check_registration import add_check_operation
from twerk_core.clinkr.group import ClinkrGroup


def build_branch_group() -> ClinkrGroup:
    group = ClinkrGroup(name="branch", help="Branch-level brmem operations.")
    add_check_operation(group, run_check_branch)
    return group
