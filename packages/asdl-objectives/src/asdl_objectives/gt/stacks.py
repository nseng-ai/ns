"""``objective gt stacks`` command implementation."""

from __future__ import annotations

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gt.types import GtCommandFailure
from asdl_objectives.context import ObjectiveCliUnavailable
from asdl_objectives.gt.context import load_objective_gt_context
from asdl_objectives.gt.models import (
    ObjectiveGtStacksRequest,
    ObjectiveGtStacksResult,
    result_from_projection,
)
from asdl_objectives.gt.render import (
    render_objective_gt_stacks_human,
    render_objective_gt_stacks_markdown,
)
from asdl_objectives.gt_stack_projection import build_objective_stack_projection
from asdl_objectives.gt_stack_scope import local_objective_stack_graph


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
    objective_gt_ctx = load_objective_gt_context(ctx)
    if isinstance(objective_gt_ctx, ObjectiveCliUnavailable):
        return ClinkrExit.failure(error_type="not_in_repo", message=objective_gt_ctx.message)

    graph = objective_gt_ctx.gt.branch_graph(objective_gt_ctx.repo_root)
    if isinstance(graph, GtCommandFailure):
        return ClinkrExit.failure(
            error_type="gt_branch_graph_failed",
            message=f"Graphite branch graph failed: {graph.message}",
        )

    local_graph = local_objective_stack_graph(objective_gt_ctx.git, graph)
    return ClinkrExit.ok(
        result_from_projection(
            build_objective_stack_projection(
                objective_gt_ctx.git,
                local_graph,
            )
        )
    )
