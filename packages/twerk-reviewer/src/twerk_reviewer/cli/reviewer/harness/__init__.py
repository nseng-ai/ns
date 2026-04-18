"""Reviewer ``harness`` subgroup: detect and inspect the review harness."""

from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup, clinkr_group


@clinkr_group(name="harness", help="Detect and inspect the review harness.")
def harness() -> ClinkrGroup:
    """Return the ``reviewer harness`` subgroup."""
    return ClinkrGroup.discover_subcommands()
