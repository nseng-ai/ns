"""Explicit builder for the ``handoff`` CLI group."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_handoff.cli.handoff.list import run_list_handoffs


def build_handoff_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="handoff",
        help="Work with directed handoff artifacts.",
        operations=[run_list_handoffs],
    )
