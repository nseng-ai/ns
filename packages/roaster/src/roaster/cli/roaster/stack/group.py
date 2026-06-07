"""Explicit builder for the ``roaster stack`` CLI subgroup."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup

# COMMAND-DRIVEN: remove this import and the operations entry if skill-first wins.
from roaster.cli.roaster.stack.command.run import run_stack_command

# SKILL-FIRST: remove this import and group.add_command(...) if command-driven wins.
from roaster.cli.roaster.stack.exec.group import build_stack_exec_group


def build_stack_group() -> ClinkrGroup:
    group = ClinkrGroup(
        name="stack",
        help="Run Graphite (`gt`) stack workflows from loose roaster profiles.",
        # COMMAND-DRIVEN mount: delete this entry with roaster/stack/command/.
        operations=[run_stack_command],
    )
    # SKILL-FIRST mount: delete this line with roaster/stack/skill/ and exec/.
    group.add_command(build_stack_exec_group())
    return group
