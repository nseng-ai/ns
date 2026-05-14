"""Reply to a PR discussion comment using canonical pr-address formatting."""

from __future__ import annotations

import dataclasses
import subprocess
from typing import Any

import click
from pydantic import model_serializer

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import IssueComment, Reaction
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext
from asdl_pr_address.cli.pr_address.reply_formatting import format_discussion_reply


class ReplyToDiscussionRequest(ClinkrModel):
    pr_number: int
    comment_id: int
    comment_author: str
    original_body: str
    response: str


class ReplyToDiscussionResult(ClinkrModel):
    body: str
    comment: IssueComment
    reaction_added: bool
    reaction: Reaction | None = None
    warning: str | None = None

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
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
) -> ClinkrExit[ReplyToDiscussionResult]:
    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    normalized_response = Ensure.truthy(
        request.response.strip(),
        error_type="invalid_request",
        message="response must not be empty",
    )

    body = format_discussion_reply(
        comment_author=request.comment_author,
        original_body=request.original_body,
        response=normalized_response,
    )

    comment = pr_address_context.gh_issue_gateway.add_comment(request.pr_number, body)

    reaction: Reaction | None = None
    warning: str | None = None
    reaction_added = False
    try:
        reaction = pr_address_context.gh_issue_gateway.add_reaction(request.comment_id, "+1")
        reaction_added = True
    except subprocess.CalledProcessError as exc:
        warning = f"Failed to add reaction to comment {request.comment_id}: {exc}"

    return ClinkrExit.ok(
        ReplyToDiscussionResult(
            body=body,
            comment=comment,
            reaction_added=reaction_added,
            reaction=reaction,
            warning=warning,
        )
    )
