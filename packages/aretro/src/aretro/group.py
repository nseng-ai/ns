"""Explicit builder for the ``aretro`` CLI group."""

from __future__ import annotations

from aretro.exec.group import build_exec_group
from asdl_core.clinkr.group import ClinkrGroup


def build_aretro_group() -> ClinkrGroup:
    outer = ClinkrGroup(
        name="aretro",
        help="Branch session retrospective evidence operations.",
    )
    outer.add_command(build_exec_group())
    return outer
