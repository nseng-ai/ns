"""Order persisted skill-first stack batches deterministically."""

from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from roaster.cli.roaster.stack.exec.common import (
    batches_from_manifest,
    branch_memory_or_fail,
    load_skill_manifest,
)
from roaster.context import RoasterCliContext
from roaster.stack_graphite import StackBatchOrderingError, order_stack_triage_batches


class OrderBatchesRequest(ClinkrModel):
    """CLI options locating a skill-first run manifest."""

    impl_branch: Annotated[
        str,
        click.Option(["--impl-branch"], required=True, help="Implementation branch name."),
    ]
    impl_branch_slug: Annotated[
        str,
        click.Option(["--impl-branch-slug"], required=True, help="Implementation branch slug."),
    ]
    profile_slug: Annotated[
        str,
        click.Option(["--profile-slug"], required=True, help="Roaster stack profile slug."),
    ]
    run_slug: Annotated[
        str,
        click.Option(["--run-slug"], required=True, help="Run slug to read."),
    ]


class OrderBatchesResult(ClinkrModel):
    """Batch ordering result."""

    run_slug: str
    ordered_batch_slugs: tuple[str, ...]


@clinkr_operation(
    name="order-batches",
    help="Order persisted skill-first stack batches dependency-first.",
)
def order_batches_command(
    ctx: click.Context,
    request: OrderBatchesRequest,
) -> ClinkrExit[OrderBatchesResult]:
    context = load_typed_context(ctx, RoasterCliContext)
    branch_memory = branch_memory_or_fail(context)
    manifest = load_skill_manifest(
        branch_memory,
        impl_branch=request.impl_branch,
        impl_branch_slug=request.impl_branch_slug,
        profile_slug=request.profile_slug,
        run_slug=request.run_slug,
    )
    ordered = order_stack_triage_batches(batches_from_manifest(manifest))
    if isinstance(ordered, StackBatchOrderingError):
        return ClinkrExit.negative(
            message=ordered.message,
            data=OrderBatchesResult(run_slug=request.run_slug, ordered_batch_slugs=()),
        )
    return ClinkrExit.ok(
        OrderBatchesResult(
            run_slug=request.run_slug,
            ordered_batch_slugs=tuple(batch.slug for batch in ordered),
        )
    )
