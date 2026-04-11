"""Add a reply to a PR review thread."""

import dataclasses
import sys
from dataclasses import dataclass
from typing import Annotated, Any

import click

from clinkr.command import ClinkrCommandError
from clinkr.operation import clinkr_operation
from twerk_core.gh.types import PRReviewComment
from twerk_pr_address.cli.pr_address._gateway_access import get_gh_issue_gateway


def _resolve_body(ctx: click.Context, param: click.Parameter, value: str) -> str:
    """Resolve the body argument. A value of ``-`` means read from stdin.

    The twerk-pr-address skill uses this with a shell heredoc so that
    multi-line bodies survive shell quoting without escape-sequence mangling.
    """
    if value == "-":
        return sys.stdin.read()
    return value


@dataclass(frozen=True)
class AddReviewThreadReplyRequest:
    thread_id: str
    body: Annotated[str, click.Argument(["body"], callback=_resolve_body)]


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
