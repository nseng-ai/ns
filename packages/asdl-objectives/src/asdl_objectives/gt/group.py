"""Explicit builder for the ``objective gt`` command group."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_objectives.gt.stacks import run_stacks


def build_gt_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="gt",
        help="Work with Graphite Objective stack projections",
        operations=[run_stacks],
    )
