"""Reviewer ``review`` subgroup: list and run reviewers by key."""

from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup, clinkr_group


@clinkr_group(name="review", help="Run and list markdown-defined reviewers.")
def review() -> ClinkrGroup:
    """Return the ``reviewer review`` subgroup."""
    return ClinkrGroup.discover_subcommands()
