"""Fetch unresolved review threads for a PR."""

import dataclasses
from typing import Any

import click
from pydantic import model_serializer

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRReviewThread
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext


class GetReviewCommentsRequest(ClinkrModel):
    pr_number: int
    include_resolved: bool = False


class GetReviewCommentsResult(ClinkrModel):
    threads: tuple[PRReviewThread, ...]

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        return {
            "threads": [dataclasses.asdict(t) for t in self.threads],
            "count": len(self.threads),
        }


@clinkr_operation(
    name="get-review-comments",
    help="Fetch review threads for a PR.",
)
def run_get_review_comments(
    ctx: click.Context,
    request: GetReviewCommentsRequest,
) -> ClinkrExit[GetReviewCommentsResult]:
    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    threads = pr_address_context.pr_gateway.get_review_threads(
        request.pr_number, include_resolved=request.include_resolved
    )
    return ClinkrExit.ok(GetReviewCommentsResult(threads=threads))
