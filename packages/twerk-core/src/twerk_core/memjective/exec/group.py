"""Explicit builder for the hidden ``memjective exec`` CLI subgroup."""

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.memjective.exec.digest import run_digest_memjective


def build_exec_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="exec",
        help="Commands for use by skills (not interactive users).",
        operations=[run_digest_memjective],
        hidden=True,
    )
