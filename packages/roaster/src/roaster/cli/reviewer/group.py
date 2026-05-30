"""Explicit builder for the `roaster` CLI group."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from roaster.cli.reviewer.exec.group import build_exec_group
from roaster.cli.reviewer.harness.group import build_harness_group
from roaster.cli.reviewer.review.group import build_review_group


def build_reviewer_group() -> ClinkrGroup:
    outer = ClinkrGroup(name="roaster", help="Markdown-driven reviewer operations.")
    outer.add_command(build_review_group())
    outer.add_command(build_harness_group())
    outer.add_command(build_exec_group())
    return outer
