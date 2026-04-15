"""Fetch unresolved review threads for a PR."""

import dataclasses
from dataclasses import dataclass
from typing import Any

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import PRReviewThread
from twerk_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway


@dataclass(frozen=True)
class GetReviewCommentsRequest:
    pr_number: int
    include_resolved: bool = False


@dataclass(frozen=True)
class GetReviewCommentsResult:
    threads: tuple[PRReviewThread, ...]

    def to_json_dict(self) -> dict[str, Any]:
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
) -> GetReviewCommentsResult | ClinkrCommandError:
    gateway = get_gh_issue_gateway(ctx)
    threads = gateway.get_review_threads(
        request.pr_number, include_resolved=request.include_resolved
    )
    return GetReviewCommentsResult(threads=threads)
