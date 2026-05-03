"""Fetch discussion comments for a PR."""

import dataclasses
from dataclasses import dataclass
from typing import Any

import click

from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import IssueComment
from asdl_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway


@dataclass(frozen=True)
class GetDiscussionCommentsRequest:
    pr_number: int


@dataclass(frozen=True)
class GetDiscussionCommentsResult(JsonSerializable):
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
    ctx: click.Context,
    request: GetDiscussionCommentsRequest,
) -> ClinkrExit[GetDiscussionCommentsResult]:
    gateway = get_gh_issue_gateway(ctx)
    comments = gateway.get_discussion_comments(request.pr_number)
    return ClinkrExit.ok(GetDiscussionCommentsResult(comments=comments))
