"""``objective gt stacks`` command implementation."""

from __future__ import annotations

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_objectives.gt.context import ObjectiveGtCliUnavailable, load_objective_gt_context
from asdl_objectives.gt.models import ObjectiveGtStacksRequest, ObjectiveGtStacksResult
from asdl_objectives.gt.render import (
    render_objective_gt_stacks_human,
    render_objective_gt_stacks_markdown,
)
from asdl_objectives.gt_stack_projection import build_objective_gt_stack_projection


@clinkr_operation(
    name="stacks",
    help="Show Objective work across Graphite-tracked branches.",
    human_renderer=render_objective_gt_stacks_human,
    markdown_renderer=render_objective_gt_stacks_markdown,
)
def run_objective_gt_stacks(
    ctx: click.Context,
    request: ObjectiveGtStacksRequest,
) -> ClinkrExit[ObjectiveGtStacksResult]:
    del request
    gt_ctx = load_objective_gt_context(ctx)
    if isinstance(gt_ctx, ObjectiveGtCliUnavailable):
        return ClinkrExit.failure(error_type="not_in_repo", message=gt_ctx.message)

    projection = build_objective_gt_stack_projection(
        repo_root=gt_ctx.repo_root,
        git=gt_ctx.git,
        gt=gt_ctx.gt,
    )
    return ClinkrExit.ok(ObjectiveGtStacksResult.from_projection(projection))
