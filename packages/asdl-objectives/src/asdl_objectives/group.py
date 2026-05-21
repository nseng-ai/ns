"""Explicit builder for the ``objective`` CLI group."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_objectives.exec.group import build_exec_group
from asdl_objectives.list import run_list_objectives
from asdl_objectives.status import run_objective_status


def build_objective_group() -> ClinkrGroup:
    outer = ClinkrGroup(
        name="objective",
        help="Work with checked-in Objective records.",
        operations=[run_list_objectives, run_objective_status],
    )
    outer.add_command(build_exec_group())
    return outer
