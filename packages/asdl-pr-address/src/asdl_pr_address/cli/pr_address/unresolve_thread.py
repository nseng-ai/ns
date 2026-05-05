"""Unresolve a PR review thread."""

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway


class UnresolveThreadRequest(ClinkrModel):
    thread_id: str


class UnresolveThreadResult(ClinkrModel):
    thread_id: str
    was_already_unresolved: bool


@clinkr_operation(
    name="unresolve-thread",
    help="Unresolve (reopen) a PR review thread by its GraphQL node ID.",
)
def run_unresolve_thread(
    ctx: click.Context,
    request: UnresolveThreadRequest,
) -> ClinkrExit[UnresolveThreadResult]:
    gateway = get_gh_issue_gateway(ctx)
    result = gateway.unresolve_review_thread(request.thread_id)
    return ClinkrExit.ok(
        UnresolveThreadResult(
            thread_id=result.thread_id,
            was_already_unresolved=result.was_already_unresolved,
        )
    )
