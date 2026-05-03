"""Add a reply to a PR review thread."""

import sys
from dataclasses import dataclass
from typing import Annotated

import click

from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRReviewComment
from asdl_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway


def _resolve_body(ctx: click.Context, param: click.Parameter, value: str) -> str:
    """Resolve the body argument. A value of ``-`` means read from stdin.

    The asdl-pr-address skill uses this with a shell heredoc so that
    multi-line bodies survive shell quoting without escape-sequence mangling.
    """
    if value == "-":
        return sys.stdin.read()
    return value


@dataclass(frozen=True)
class AddReviewThreadReplyRequest:
    thread_id: str
    body: Annotated[str, click.Argument(["body"], callback=_resolve_body)]


@dataclass(frozen=True)
class AddReviewThreadReplyResult(JsonSerializable):
    comment: PRReviewComment


@clinkr_operation(
    name="add-review-thread-reply",
    help="Post a reply comment on a PR review thread.",
)
def run_add_review_thread_reply(
    ctx: click.Context,
    request: AddReviewThreadReplyRequest,
) -> ClinkrExit[AddReviewThreadReplyResult]:
    gateway = get_gh_issue_gateway(ctx)
    comment = gateway.add_review_thread_reply(request.thread_id, request.body)
    return ClinkrExit.ok(AddReviewThreadReplyResult(comment=comment))
