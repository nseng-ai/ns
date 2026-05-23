"""Fetch discussion comments for a PR."""

import dataclasses
from typing import Any

import click
from pydantic import model_serializer

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRDiscussionComment
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext


class GetDiscussionCommentsRequest(ClinkrModel):
    pr_number: int


class GetDiscussionCommentsResult(ClinkrModel):
    comments: tuple[PRDiscussionComment, ...]

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        return {
            "comments": [dataclasses.asdict(c) for c in self.comments],
            "count": len(self.comments),
        }


@clinkr_operation(
    name="get-discussion-comments",
    help="Fetch discussion comments for a PR.",
)
def run_get_discussion_comments(
    ctx: click.Context,
    request: GetDiscussionCommentsRequest,
) -> ClinkrExit[GetDiscussionCommentsResult]:
    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    comments = pr_address_context.pr_gateway.get_pr_discussion_comments(request.pr_number)
    return ClinkrExit.ok(GetDiscussionCommentsResult(comments=comments))
