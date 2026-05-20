"""Explicit builder for the hidden ``branch-retro exec`` CLI subgroup."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_retro.exec.collect_evidence import run_collect_evidence


def build_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Commands for use by branch retrospective skills.",
        operations=[run_collect_evidence],
        hidden=True,
    )
