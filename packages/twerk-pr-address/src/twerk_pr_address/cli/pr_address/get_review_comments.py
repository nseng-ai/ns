"""Fetch unresolved review threads for a PR."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from typing import Any

from clinkr.command import ClinkrCommandError
from clinkr.operation import clinkr_operation
from twerk_pr_address.cli.pr_address._gateway_access import get_pr_address_gateway
from twerk_pr_address.types import PRReviewThread


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
    request: GetReviewCommentsRequest,
) -> GetReviewCommentsResult | ClinkrCommandError:
    gateway = get_pr_address_gateway()
    threads = gateway.get_pr_review_threads(
        request.pr_number, include_resolved=request.include_resolved
    )
    return GetReviewCommentsResult(threads=threads)
