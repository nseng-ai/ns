"""Resolve a PR review thread."""

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway


class ResolveThreadRequest(ClinkrModel):
    thread_id: str


class ResolveThreadResult(ClinkrModel):
    thread_id: str
    was_already_resolved: bool


@clinkr_operation(
    name="resolve-thread",
    help="Resolve a PR review thread by its GraphQL node ID.",
)
def run_resolve_thread(
    ctx: click.Context,
    request: ResolveThreadRequest,
) -> ClinkrExit[ResolveThreadResult]:
    gateway = get_gh_issue_gateway(ctx)
    result = gateway.resolve_review_thread(request.thread_id)
    return ClinkrExit.ok(
        ResolveThreadResult(
            thread_id=result.thread_id,
            was_already_resolved=result.was_already_resolved,
        )
    )
