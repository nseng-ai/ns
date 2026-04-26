"""Fetch PR-level review submissions."""

import dataclasses
from dataclasses import dataclass
from typing import Any

import click

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import PRReview
from twerk_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway


@dataclass(frozen=True)
class GetReviewsRequest:
    pr_number: int


@dataclass(frozen=True)
class GetReviewsResult(JsonSerializable):
    reviews: tuple[PRReview, ...]

    def to_json_dict(self) -> dict[str, Any]:
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
    gateway = get_gh_issue_gateway(ctx)
    reviews = gateway.get_reviews(request.pr_number)
    return ClinkrExit.ok(GetReviewsResult(reviews=reviews))
