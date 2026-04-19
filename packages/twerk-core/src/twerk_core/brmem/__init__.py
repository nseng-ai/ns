"""Manage branch-scoped memory stored in git refs."""

from twerk_core.clinkr.group import ClinkrGroup, clinkr_group, discover_group


@clinkr_group(name="brmem", help="Manage branch-scoped memory stored in git refs.")
def brmem() -> ClinkrGroup:
    group = ClinkrGroup.discover_subcommands()
    group.add_command(discover_group("twerk_core.brmem.branch"))
    return group
