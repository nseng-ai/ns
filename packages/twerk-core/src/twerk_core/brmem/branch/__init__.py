"""Branch-level brmem operations."""

from twerk_core.clinkr.group import ClinkrGroup, clinkr_group


@clinkr_group(name="branch", help="Branch-level brmem operations.")
def branch() -> ClinkrGroup:
    return ClinkrGroup.discover_subcommands()
