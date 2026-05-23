"""Unresolve a PR review thread."""

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext


class UnresolveThreadRequest(ClinkrModel):
    thread_id: str


class UnresolveThreadResult(ClinkrModel):
    thread_id: str
    is_resolved: bool


@clinkr_operation(
    name="unresolve-thread",
    help="Unresolve (reopen) a PR review thread by its GraphQL node ID.",
)
def run_unresolve_thread(
    ctx: click.Context,
    request: UnresolveThreadRequest,
) -> ClinkrExit[UnresolveThreadResult]:
    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    result = pr_address_context.pr_gateway.unresolve_review_thread(request.thread_id)
    return ClinkrExit.ok(
        UnresolveThreadResult(
            thread_id=result.thread_id,
            is_resolved=result.is_resolved,
        )
    )
