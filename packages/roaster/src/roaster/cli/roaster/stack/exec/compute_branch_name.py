"""Compute deterministic skill-first generated branch names."""

from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from roaster.stack.core.contracts import GeneratedStackBranch
from roaster.stack.core.slugs import generated_batch_branch_name


class ComputeBranchNameRequest(ClinkrModel):
    """CLI arguments for generated branch naming."""

    impl_branch_slug: Annotated[
        str,
        click.Option(["--impl-branch-slug"], required=True, help="Implementation branch slug."),
    ]
    run_slug: Annotated[
        str,
        click.Option(["--run-slug"], required=True, help="Run slug."),
    ]
    batch_slug: Annotated[
        str,
        click.Option(["--batch-slug"], required=True, help="Batch slug."),
    ]


@clinkr_operation(
    name="compute-branch-name",
    help="Compute the deterministic Graphite branch name for a skill-first batch.",
)
def compute_branch_name_command(
    ctx: click.Context,
    request: ComputeBranchNameRequest,
) -> ClinkrExit[GeneratedStackBranch]:
    del ctx
    branch_name = generated_batch_branch_name(
        impl_branch_slug=request.impl_branch_slug,
        run_slug=request.run_slug,
        batch_slug=request.batch_slug,
    )
    return ClinkrExit.ok(
        GeneratedStackBranch(
            branch_name=branch_name,
            impl_branch_slug=request.impl_branch_slug,
            run_slug=request.run_slug,
            batch_slug=request.batch_slug,
        )
    )
