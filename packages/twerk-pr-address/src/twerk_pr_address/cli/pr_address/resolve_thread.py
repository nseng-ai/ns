"""Resolve a PR review thread."""

from dataclasses import dataclass

import click

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway


@dataclass(frozen=True)
class ResolveThreadRequest:
    thread_id: str


@dataclass(frozen=True)
class ResolveThreadResult(JsonSerializable):
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
