"""Explicit builder for the ``roaster stack`` CLI subgroup."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from roaster.cli.roaster.stack.list_profiles import run_stack_profile_list_command
from roaster.cli.roaster.stack.run import run_stack_command


def build_stack_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="stack",
        help="Run Graphite (`gt`) stack workflows from loose roaster profiles.",
        operations=[run_stack_profile_list_command, run_stack_command],
    )
