"""Explicit builder for the `objective` CLI group."""

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.objective.exec.group import build_exec_group
from twerk_core.objective.list import run_list_objectives
from twerk_core.objective.show import run_show_objective
from twerk_core.objective.tree import run_tree_objective


def build_objective_group() -> ClinkrGroup:
    outer = ClinkrGroup(
        name="objective",
        help="Inspect objective snapshots stored as brmem entries.",
        operations=[run_list_objectives, run_show_objective, run_tree_objective],
    )
    outer.add_command(build_exec_group())
    return outer
