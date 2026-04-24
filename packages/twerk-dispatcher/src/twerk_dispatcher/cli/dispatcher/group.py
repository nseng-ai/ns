"""Explicit builder for the `dispatcher` CLI group."""

from twerk_core.clinkr.group import ClinkrGroup


def build_dispatcher_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="dispatcher",
        help="Dispatch coding tasks to GitHub Actions.",
        operations=[],
    )
