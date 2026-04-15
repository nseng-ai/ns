"""PR review address operations."""

from twerk_core.clinkr.group import ClinkrGroupSpec, clinkr_group, discover_operations


@clinkr_group(name="pr-address", help="PR review address operations.")
def pr_address() -> ClinkrGroupSpec:
    """Return the `twerk pr-address` subgroup.

    All operations are nested under an ``exec`` subgroup to signal that
    they are internal commands used by the pr-address skill, not
    user-facing entry points.

    The explicit ``name="pr-address"`` override is necessary because the
    Python module is ``twerk_pr_address.cli.pr_address`` (underscored),
    but the desired CLI subgroup name is hyphenated.
    """
    return ClinkrGroupSpec(
        subgroups=(
            discover_operations(
                "twerk_pr_address.cli.pr_address",
                name="exec",
                help="Commands for use by the pr-address skill.",
            ),
        ),
        json_group_hidden=True,
    )
