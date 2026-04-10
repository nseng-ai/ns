"""Fetch discussion comments for a PR."""

import dataclasses
from dataclasses import dataclass
from typing import Any

from clinkr.command import ClinkrCommandError
from clinkr.operation import clinkr_operation
from twerk_core.gh.types import IssueComment
from twerk_pr_address.cli.pr_address._gateway_access import get_gh_issue_gateway


@dataclass(frozen=True)
class GetDiscussionCommentsRequest:
    pr_number: int


@dataclass(frozen=True)
class GetDiscussionCommentsResult:
    comments: tuple[IssueComment, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "comments": [dataclasses.asdict(c) for c in self.comments],
            "count": len(self.comments),
        }


@clinkr_operation(
    name="get-discussion-comments",
    help="Fetch discussion comments for a PR.",
)
def run_get_discussion_comments(
    request: GetDiscussionCommentsRequest,
) -> GetDiscussionCommentsResult | ClinkrCommandError:
    gateway = get_gh_issue_gateway()
    comments = gateway.get_discussion_comments(request.pr_number)
    return GetDiscussionCommentsResult(comments=comments)
