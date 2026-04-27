"""Explicit builder for the `memjective` CLI group."""

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.memjective.exec.group import build_exec_group
from twerk_core.memjective.list import run_list_memjectives
from twerk_core.memjective.show import run_show_memjective
from twerk_core.memjective.tree import run_tree_memjective


def build_memjective_group() -> ClinkrGroup:
    outer = ClinkrGroup(
        name="memjective",
        help="Inspect memjective snapshots stored as brmem entries.",
        operations=[run_list_memjectives, run_show_memjective, run_tree_memjective],
    )
    outer.add_command(build_exec_group())
    return outer
