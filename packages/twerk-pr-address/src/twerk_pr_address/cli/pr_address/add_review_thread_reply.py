"""Add a reply to a PR review thread."""

import dataclasses
from dataclasses import dataclass
from typing import Any

from clinkr.command import ClinkrCommandError
from clinkr.operation import clinkr_operation
from twerk_core.gh.types import PRReviewComment
from twerk_pr_address.cli.pr_address._gateway_access import get_gh_issue_gateway


@dataclass(frozen=True)
class AddReviewThreadReplyRequest:
    thread_id: str
    body: str


@dataclass(frozen=True)
class AddReviewThreadReplyResult:
    comment: PRReviewComment

    def to_json_dict(self) -> dict[str, Any]:
        return {"comment": dataclasses.asdict(self.comment)}


@clinkr_operation(
    name="add-review-thread-reply",
    help="Post a reply comment on a PR review thread.",
)
def run_add_review_thread_reply(
    request: AddReviewThreadReplyRequest,
) -> AddReviewThreadReplyResult | ClinkrCommandError:
    gateway = get_gh_issue_gateway()
    comment = gateway.add_review_thread_reply(request.thread_id, request.body)
    return AddReviewThreadReplyResult(comment=comment)
