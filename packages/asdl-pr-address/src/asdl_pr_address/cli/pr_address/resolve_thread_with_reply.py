"""Reply to and resolve a PR review thread using canonical pr-address formatting."""

from __future__ import annotations

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.types import PRReviewComment
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext
from asdl_pr_address.cli.pr_address.reply_formatting import (
    ResolutionReplyMode,
    format_resolution_reply,
)


class ResolveThreadWithReplyRequest(ClinkrModel):
    thread_id: str
    mode: ResolutionReplyMode
    message: str | None
    commit_sha: str | None


class ResolveThreadWithReplyResult(ClinkrModel):
    thread_id: str
    body: str
    comment: PRReviewComment
    is_resolved: bool


@clinkr_operation(
    name="resolve-thread-with-reply",
    help="Reply to and resolve a PR review thread with canonical pr-address formatting.",
)
def run_resolve_thread_with_reply(
    ctx: click.Context,
    request: ResolveThreadWithReplyRequest,
) -> ClinkrExit[ResolveThreadWithReplyResult]:
    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    return ClinkrExit.ok(resolve_thread_with_reply(pr_address_context.pr_gateway, request))


def normalize_resolution_request(
    request: ResolveThreadWithReplyRequest,
) -> ResolveThreadWithReplyRequest:
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

    return ResolveThreadWithReplyRequest(
        thread_id=request.thread_id,
        mode=request.mode,
        message=request.message.strip() if request.message is not None else None,
        commit_sha=request.commit_sha.strip() if request.commit_sha is not None else None,
    )


def resolve_thread_with_reply(
    pr_gateway: PRGateway,
    request: ResolveThreadWithReplyRequest,
) -> ResolveThreadWithReplyResult:
    normalized = normalize_resolution_request(request)
    body = format_resolution_reply(
        mode=normalized.mode,
        message=normalized.message,
        commit_sha=normalized.commit_sha,
    )

    comment = pr_gateway.add_review_thread_reply(normalized.thread_id, body)
    resolve_result = pr_gateway.resolve_review_thread(normalized.thread_id)
    return ResolveThreadWithReplyResult(
        thread_id=resolve_result.thread_id,
        body=body,
        comment=comment,
        is_resolved=resolve_result.is_resolved,
    )
