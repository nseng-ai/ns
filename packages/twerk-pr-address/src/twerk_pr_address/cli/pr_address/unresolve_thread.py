"""Unresolve a PR review thread."""

from dataclasses import dataclass

import click

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway


@dataclass(frozen=True)
class UnresolveThreadRequest:
    thread_id: str


@dataclass(frozen=True)
class UnresolveThreadResult(JsonSerializable):
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
