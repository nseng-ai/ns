"""Explicit builder for the ``branch-retro`` CLI group."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_retro.exec.group import build_exec_group


def build_branch_retro_group() -> ClinkrGroup:
    outer = ClinkrGroup(
        name="branch-retro",
        help="Branch session retrospective evidence operations.",
    )
    outer.add_command(build_exec_group())
    return outer
