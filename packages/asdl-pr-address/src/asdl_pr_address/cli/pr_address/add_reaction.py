"""Add a reaction to a comment."""

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext


class AddReactionRequest(ClinkrModel):
    comment_id: int
    reaction: str


class AddReactionResult(ClinkrModel):
    id: int
    comment_id: int
    content: str


@clinkr_operation(
    name="add-reaction",
    help="Add a reaction to a comment.",
)
def run_add_reaction(
    ctx: click.Context,
    request: AddReactionRequest,
) -> ClinkrExit[AddReactionResult]:
    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    result = pr_address_context.gh_issue_gateway.add_reaction(request.comment_id, request.reaction)
    return ClinkrExit.ok(
        AddReactionResult(
            id=result.id,
            comment_id=result.comment_id,
            content=result.content,
        )
    )
