"""Explicit builder for the hidden ``initiative exec`` CLI subgroup."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_initiatives.exec.list import run_list_initiatives


def build_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Commands for use by initiative skills.",
        operations=[run_list_initiatives],
        hidden=True,
    )
