"""Explicit builder for the ``objective`` CLI group."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_objectives.archive import run_archive_objective
from asdl_objectives.exec.group import build_exec_group
from asdl_objectives.gt.group import build_gt_group
from asdl_objectives.list import run_list_objectives


def build_objective_group() -> ClinkrGroup:
    outer = ClinkrGroup(
        name="objective",
        help="Work with checked-in Objective records.",
        operations=[run_archive_objective, run_list_objectives],
    )
    outer.add_command(build_exec_group())
    outer.add_command(build_gt_group())
    return outer
