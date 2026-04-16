"""Reply to a PR discussion comment using canonical pr-address formatting."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from typing import Any

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import IssueComment, Reaction
from twerk_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway
from twerk_pr_address.cli.pr_address.reply_formatting import format_discussion_reply


@dataclass(frozen=True)
class ReplyToDiscussionRequest:
    pr_number: int
    comment_id: int
    comment_author: str
    original_body: str
    response: str


@dataclass(frozen=True)
class ReplyToDiscussionResult:
    body: str
    comment: IssueComment
    reaction_added: bool
    reaction: Reaction | None = None
    warning: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "body": self.body,
            "comment": dataclasses.asdict(self.comment),
            "reaction_added": self.reaction_added,
        }
        if self.reaction is not None:
            payload["reaction"] = dataclasses.asdict(self.reaction)
        if self.warning is not None:
            payload["warning"] = self.warning
        return payload


@clinkr_operation(
    name="reply-to-discussion",
    help="Reply to a PR discussion comment and add a +1 reaction when possible.",
)
def run_reply_to_discussion(
    ctx: click.Context,
    request: ReplyToDiscussionRequest,
) -> ReplyToDiscussionResult | ClinkrCommandError:
    normalized_response = request.response.strip()
    if not normalized_response:
        return ClinkrCommandError(
            error_type="invalid_request",
            message="response must not be empty",
        )

    body = format_discussion_reply(
        comment_author=request.comment_author,
        original_body=request.original_body,
        response=normalized_response,
    )

    gateway = get_gh_issue_gateway(ctx)
    comment = gateway.add_comment(request.pr_number, body)

    reaction: Reaction | None = None
    warning: str | None = None
    reaction_added = False
    try:
        reaction = gateway.add_reaction(request.comment_id, "+1")
        reaction_added = True
    except Exception as exc:
        warning = f"Failed to add reaction to comment {request.comment_id}: {exc}"

    return ReplyToDiscussionResult(
        body=body,
        comment=comment,
        reaction_added=reaction_added,
        reaction=reaction,
        warning=warning,
    )
