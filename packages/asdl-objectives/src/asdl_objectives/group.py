"""Explicit builder for the ``objective`` CLI group."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_objectives.exec.group import build_exec_group


def build_objective_group() -> ClinkrGroup:
    outer = ClinkrGroup(
        name="objective",
        help="Work with checked-in Objective records.",
    )
    outer.add_command(build_exec_group())
    return outer
