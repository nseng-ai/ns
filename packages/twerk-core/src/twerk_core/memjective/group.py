"""Explicit builder for the `memjective` CLI group."""

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.memjective.check import run_check_memjective
from twerk_core.memjective.exec_group import build_memjective_exec_group
from twerk_core.memjective.list import run_list_memjectives
from twerk_core.memjective.show import run_show_memjective
from twerk_core.memjective.tree import run_tree_memjective


def build_memjective_group() -> ClinkrGroup:
    group = ClinkrGroup(
        name="memjective",
        help="Inspect memjective snapshots stored as brmem entries.",
        operations=[
            run_check_memjective,
            run_list_memjectives,
            run_show_memjective,
            run_tree_memjective,
        ],
    )
    group.add_command(build_memjective_exec_group(), "exec")
    return group
