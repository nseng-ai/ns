"""Queue one-shot remote work."""

from twerk_core.clinkr.group import ClinkrGroup, clinkr_group


@clinkr_group(help="Queue one-shot remote work.")
def oneshot() -> ClinkrGroup:
    """Return the `twerk oneshot` subgroup."""
    group = ClinkrGroup()
    group._json_group.hidden = True
    return group
