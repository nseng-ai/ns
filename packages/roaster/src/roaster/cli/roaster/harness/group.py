"""Explicit builder for the `reviewer harness` CLI subgroup."""

from asdl_core.clinkr.group import ClinkrGroup
from asdl_reviewer.cli.reviewer.harness.list_harnesses import run_harness_list_command
from asdl_reviewer.cli.reviewer.harness.show_harness import run_harness_show_command


def build_harness_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="harness",
        help="Detect and inspect the review harness.",
        operations=[run_harness_list_command, run_harness_show_command],
    )
