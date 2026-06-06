"""Explicit builder for the `roaster` CLI group."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from roaster.cli.roaster.exec.group import build_exec_group
from roaster.cli.roaster.harness.group import build_harness_group
from roaster.cli.roaster.profile.group import build_profile_group
from roaster.cli.roaster.review.group import build_review_group
from roaster.cli.roaster.stack.group import build_stack_group


def build_roaster_group() -> ClinkrGroup:
    outer = ClinkrGroup(name="roaster", help="Markdown-driven roaster operations.")
    outer.add_command(build_review_group())
    outer.add_command(build_harness_group())
    outer.add_command(build_profile_group())
    outer.add_command(build_stack_group())
    outer.add_command(build_exec_group())
    return outer
