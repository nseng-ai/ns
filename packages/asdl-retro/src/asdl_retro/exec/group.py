"""Explicit builder for the hidden ``branch-retro exec`` CLI subgroup."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup


def build_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Commands for use by branch retrospective skills.",
        operations=[],
        hidden=True,
    )
