"""``objective gt stacks`` — project Objective work across a Graphite stack."""

from __future__ import annotations

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import GitCommandFailure
from asdl_core.gt.types import GtCommandFailure
from asdl_objectives.context import ObjectiveCliUnavailable
from asdl_objectives.gt.context import load_objective_gt_context
from asdl_objectives.gt.models import (
    ObjectiveGtStacksRequest,
    ObjectiveGtStacksResult,
    result_from_projection,
)
from asdl_objectives.gt.projection import (
    ObjectiveStackProjection,
    _SliceReadFailure,
    _TrunkStatusReadFailure,
    project_objective_stacks,
)
from asdl_objectives.gt.render import render_stacks_human, render_stacks_markdown
from asdl_objectives.list_branch_inventory import branch_ref


@clinkr_operation(
    name="stacks",
    help="Show Objective work across Graphite-tracked branches",
    human_renderer=render_stacks_human,
    markdown_renderer=render_stacks_markdown,
)
def run_stacks(
    ctx: click.Context,
    request: ObjectiveGtStacksRequest,
) -> ClinkrExit[ObjectiveGtStacksResult]:
    gt_ctx = load_objective_gt_context(ctx)
    if isinstance(gt_ctx, ObjectiveCliUnavailable):
        Ensure.fail(error_type="not_in_repo", message=gt_ctx.message)

    base = gt_ctx.base
    projection = project_objective_stacks(
        gt_ctx.gt,
        base.git,
        trunk_ref=branch_ref(base.trunk_branch),
        cwd=base.repo_root,
    )
    # Match the sentinel subclasses BEFORE the bare GitCommandFailure case
    # (order matters — both sentinels subclass GitCommandFailure).
    match projection:
        case _TrunkStatusReadFailure() as failure:
            Ensure.fail(
                error_type="trunk_status_read_failed",
                message=f"Failed to read trunk Objective status: {failure.message}",
            )
        case _SliceReadFailure() as failure:
            Ensure.fail(
                error_type="gt_slice_read_failed",
                message=f"Failed to read branch slice: {failure.message}",
            )
        case GtCommandFailure() as failure:
            Ensure.fail(
                error_type="gt_branch_graph_failed",
                message=f"Graphite branch graph failed: {failure.message}",
            )
        case ObjectiveStackProjection() as projected:
            return ClinkrExit.ok(result_from_projection(projected))
        case GitCommandFailure() as failure:
            # Defensive: the projection always wraps git read failures in a
            # slice/trunk sentinel above, so a bare GitCommandFailure should
            # never reach here. Attribute it to the slice-read family.
            Ensure.fail(
                error_type="gt_slice_read_failed",
                message=f"Failed to read branch slice: {failure.message}",
            )
