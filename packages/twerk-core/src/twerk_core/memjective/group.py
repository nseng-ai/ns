"""Explicit builder for the `memjective` CLI group."""

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.memjective.list import run_list_memjectives


def build_memjective_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="memjective",
        help="Inspect memjective snapshots stored as brmem entries.",
        operations=[run_list_memjectives],
    )
