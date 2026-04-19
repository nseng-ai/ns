"""Explicit builder for the `objective` CLI group."""

from twerk_core.clinkr.group import ClinkrGroup
from twerk_objectives.cli.objective.list import run_list_objectives


def build_objective_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="objective",
        help="Manage objectives.",
        operations=[run_list_objectives],
    )
