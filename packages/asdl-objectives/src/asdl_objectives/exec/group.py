"""Explicit builder for the hidden ``objective exec`` CLI subgroup."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_objectives.exec.read_objective import run_read_objective


def build_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Commands for use by objective skills.",
        operations=[run_read_objective],
        hidden=True,
    )
