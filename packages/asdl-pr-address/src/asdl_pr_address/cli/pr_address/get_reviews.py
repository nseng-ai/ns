"""Fetch PR-level review submissions."""

import dataclasses
from typing import Any

import click
from pydantic import model_serializer

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRReview
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext


class GetReviewsRequest(ClinkrModel):
    pr_number: int


class GetReviewsResult(ClinkrModel):
    reviews: tuple[PRReview, ...]

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        return {
            "reviews": [dataclasses.asdict(r) for r in self.reviews],
            "count": len(self.reviews),
        }


@clinkr_operation(
    name="get-reviews",
    help="Fetch PR-level review submissions (approve, request changes, comment).",
)
def run_get_reviews(
    ctx: click.Context,
    request: GetReviewsRequest,
) -> ClinkrExit[GetReviewsResult]:
    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    reviews = pr_address_context.gh_issue_gateway.get_reviews(request.pr_number)
    return ClinkrExit.ok(GetReviewsResult(reviews=reviews))
