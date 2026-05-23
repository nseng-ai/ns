"""Add a discussion comment to a PR."""

import sys
from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRDiscussionComment
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext


def _resolve_body(ctx: click.Context, param: click.Parameter, value: str) -> str:
    """Resolve the body argument. A value of ``-`` means read from stdin.

    The asdl-pr-address skill uses this with a shell heredoc so that
    multi-line bodies survive shell quoting without escape-sequence mangling.
    """
    if value == "-":
        return sys.stdin.read()
    return value


class AddDiscussionCommentRequest(ClinkrModel):
    pr_number: int
    body: Annotated[str, click.Argument(["body"], callback=_resolve_body)]


class AddDiscussionCommentResult(ClinkrModel):
    comment: PRDiscussionComment


@clinkr_operation(
    name="add-issue-comment",
    help="Add a discussion comment to a PR.",
)
def run_add_issue_comment(
    ctx: click.Context,
    request: AddDiscussionCommentRequest,
) -> ClinkrExit[AddDiscussionCommentResult]:
    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    comment = pr_address_context.pr_gateway.add_pr_discussion_comment(
        request.pr_number,
        request.body,
    )
    return ClinkrExit.ok(AddDiscussionCommentResult(comment=comment))
