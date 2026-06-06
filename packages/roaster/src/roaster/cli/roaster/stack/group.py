"""Explicit builder for the ``roaster stack`` CLI subgroup."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from roaster.cli.roaster.stack.exec.group import build_stack_exec_group
from roaster.cli.roaster.stack.run import run_stack_command


def build_stack_group() -> ClinkrGroup:
    group = ClinkrGroup(
        name="stack",
        help="Run Graphite (`gt`) stack workflows from loose roaster profiles.",
        operations=[run_stack_command],
    )
    group.add_command(build_stack_exec_group())
    return group
