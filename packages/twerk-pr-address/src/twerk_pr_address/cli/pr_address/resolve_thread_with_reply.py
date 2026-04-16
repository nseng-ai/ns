"""Reply to and resolve a PR review thread using canonical pr-address formatting."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from typing import Any, Literal

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import PRReviewComment
from twerk_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway
from twerk_pr_address.cli.pr_address.reply_formatting import format_resolution_reply


@dataclass(frozen=True)
class ResolveThreadWithReplyRequest:
    thread_id: str
    mode: Literal["fixed", "pre_existing", "explained"]
    message: str | None
    commit_sha: str | None


@dataclass(frozen=True)
class ResolveThreadWithReplyResult:
    thread_id: str
    body: str
    comment: PRReviewComment
    was_already_resolved: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "thread_id": self.thread_id,
            "body": self.body,
            "comment": dataclasses.asdict(self.comment),
            "was_already_resolved": self.was_already_resolved,
        }


@clinkr_operation(
    name="resolve-thread-with-reply",
    help="Reply to and resolve a PR review thread with canonical pr-address formatting.",
)
def run_resolve_thread_with_reply(
    ctx: click.Context,
    request: ResolveThreadWithReplyRequest,
) -> ResolveThreadWithReplyResult | ClinkrCommandError:
    try:
        body = format_resolution_reply(
            mode=request.mode,
            message=request.message,
            commit_sha=request.commit_sha,
        )
    except ValueError as exc:
        return ClinkrCommandError(error_type="invalid_request", message=str(exc))

    gateway = get_gh_issue_gateway(ctx)
    comment = gateway.add_review_thread_reply(request.thread_id, body)
    resolve_result = gateway.resolve_review_thread(request.thread_id)
    return ResolveThreadWithReplyResult(
        thread_id=request.thread_id,
        body=body,
        comment=comment,
        was_already_resolved=resolve_result.was_already_resolved,
    )
