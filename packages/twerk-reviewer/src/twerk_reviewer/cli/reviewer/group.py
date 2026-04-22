"""Explicit builder for the `reviewer` CLI group."""

from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup
from twerk_reviewer.cli.reviewer.exec.group import build_exec_group
from twerk_reviewer.cli.reviewer.harness.group import build_harness_group
from twerk_reviewer.cli.reviewer.review.group import build_review_group


def build_reviewer_group() -> ClinkrGroup:
    outer = ClinkrGroup(name="reviewer", help="Markdown-driven reviewer operations.")
    outer.add_command(build_review_group())
    outer.add_command(build_harness_group())
    outer.add_command(build_exec_group())
    return outer
