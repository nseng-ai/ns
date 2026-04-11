"""PR review address operations."""

from clinkr.group import ClinkrGroup, clinkr_group


@clinkr_group(name="pr-address", help="PR review address operations.")
def pr_address() -> ClinkrGroup:
    """Return the `twerk pr-address` subgroup.

    The explicit `name="pr-address"` override is necessary because the
    Python module is `twerk_pr_address.cli.pr_address` (underscored), but
    the desired CLI subgroup name is hyphenated to match the established
    naming convention in the skill, docs, and push-down inventory.
    """
    return ClinkrGroup.discover_subcommands()
