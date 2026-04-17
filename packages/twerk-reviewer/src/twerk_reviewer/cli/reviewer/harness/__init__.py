"""Reviewer ``harness`` subgroup: detect, select, and persist harness choice."""

from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup, clinkr_group
from twerk_reviewer.cli.reviewer.harness.init_harness import init_harness


@clinkr_group(name="harness", help="Detect, select, and inspect the review harness.")
def harness() -> ClinkrGroup:
    """Return the ``reviewer harness`` subgroup."""
    group = ClinkrGroup.discover_subcommands()
    group.add_command(init_harness)
    return group
