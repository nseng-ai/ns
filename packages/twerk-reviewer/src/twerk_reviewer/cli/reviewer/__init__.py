"""Markdown-driven reviewer operations."""

from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup, clinkr_group


@clinkr_group(help="Markdown-driven reviewer operations.")
def reviewer() -> ClinkrGroup:
    """Return the ``reviewer`` CLI group (no subcommands yet)."""
    return ClinkrGroup.discover_subcommands()
