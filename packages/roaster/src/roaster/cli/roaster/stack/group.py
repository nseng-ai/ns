"""Explicit builder for the ``roaster stack`` CLI subgroup."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from roaster.cli.roaster.stack.run import run_stack_command


def build_stack_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="stack",
        help="Run Graphite (`gt`) stack workflows from loose roaster profiles.",
        operations=[run_stack_command],
    )
