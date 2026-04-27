"""Explicit builder for the hidden ``objective exec`` CLI subgroup."""

from twerk_core.clinkr.group import ClinkrGroup
from twerk_objectives.exec.digest import run_digest_objective


def build_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Commands for use by skills (not interactive users).",
        operations=[run_digest_objective],
        hidden=True,
    )
