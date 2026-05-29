"""Graphite-backed subgroup for the ``objective`` CLI."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_objectives.gt.stacks import run_objective_gt_stacks


def build_objective_gt_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="gt",
        help="Work with Graphite Objective stack projections.",
        operations=[run_objective_gt_stacks],
    )
