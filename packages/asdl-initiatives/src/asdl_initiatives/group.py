"""Explicit builder for the ``initiative`` CLI group."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_initiatives.exec.group import build_exec_group


def build_initiative_group() -> ClinkrGroup:
    outer = ClinkrGroup(
        name="initiative",
        help="Work with checked-in Initiative records.",
    )
    outer.add_command(build_exec_group())
    return outer
