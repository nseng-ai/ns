"""Reply to and resolve a PR review thread using canonical pr-address formatting."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import click

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.ensure import Ensure
from twerk_core.clinkr.exit import ClinkrExit
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
class ResolveThreadWithReplyResult(JsonSerializable):
    thread_id: str
    body: str
    comment: PRReviewComment
    was_already_resolved: bool


@clinkr_operation(
    name="resolve-thread-with-reply",
    help="Reply to and resolve a PR review thread with canonical pr-address formatting.",
)
def run_resolve_thread_with_reply(
    ctx: click.Context,
    request: ResolveThreadWithReplyRequest,
) -> ClinkrExit[ResolveThreadWithReplyResult]:
    if request.mode == "fixed":
        Ensure.truthy(
            request.message and request.message.strip(),
            error_type="invalid_request",
            message="mode='fixed' requires a non-empty message",
        )
        Ensure.truthy(
            request.commit_sha and request.commit_sha.strip(),
            error_type="invalid_request",
            message="mode='fixed' requires a non-empty commit_sha",
        )
    elif request.mode == "explained":
        Ensure.truthy(
            request.message and request.message.strip(),
            error_type="invalid_request",
            message="mode='explained' requires a non-empty message",
        )

    normalized_message = request.message.strip() if request.message is not None else None
    normalized_sha = request.commit_sha.strip() if request.commit_sha is not None else None

    body = format_resolution_reply(
        mode=request.mode,
        message=normalized_message,
        commit_sha=normalized_sha,
    )

    gateway = get_gh_issue_gateway(ctx)
    comment = gateway.add_review_thread_reply(request.thread_id, body)
    resolve_result = gateway.resolve_review_thread(request.thread_id)
    return ClinkrExit.ok(
        ResolveThreadWithReplyResult(
            thread_id=request.thread_id,
            body=body,
            comment=comment,
            was_already_resolved=resolve_result.was_already_resolved,
        )
    )
