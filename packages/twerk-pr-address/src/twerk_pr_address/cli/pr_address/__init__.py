"""PR review address operations."""

from twerk_core.clinkr.group import ClinkrGroup, clinkr_group


@clinkr_group(name="pr-address", help="PR review address operations.")
def pr_address() -> ClinkrGroup:
    """Return the `twerk pr-address` subgroup.

    All operations are nested under an ``exec`` subgroup to signal that
    they are internal commands used by the pr-address skill, not
    user-facing entry points.

    The explicit ``name="pr-address"`` override is necessary because the
    Python module is ``twerk_pr_address.cli.pr_address`` (underscored),
    but the desired CLI subgroup name is hyphenated.
    """
    exec_group = ClinkrGroup.discover_subcommands()
    exec_group.name = "exec"
    exec_group.help = "Commands for use by the pr-address skill."

    outer = ClinkrGroup()
    outer._json_group.hidden = True
    outer.add_command(exec_group)
    return outer
