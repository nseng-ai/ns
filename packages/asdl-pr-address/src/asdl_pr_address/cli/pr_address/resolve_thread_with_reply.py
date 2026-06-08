"""Reply to and resolve a PR review thread using canonical pr-address formatting."""

from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.types import PRReviewComment
from asdl_core.git.git_gateway import GitGateway
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext
from asdl_pr_address.cli.pr_address.reply_formatting import (
    ResolutionReplyMode,
    format_resolution_reply,
)
from asdl_pr_address.cli.pr_address.resolution_provenance import (
    parse_resolution_provenance_json,
    validate_resolution_provenance,
)
from asdl_pr_address.cli.pr_address.resolution_provenance_models import (
    ResolutionProvenance,
    ResolutionProvenanceInput,
)
from asdl_pr_address.cli.pr_address.string_values import trim_optional


class ResolveThreadWithReplyRequest(ClinkrModel):
    thread_id: str
    mode: ResolutionReplyMode
    message: str | None
    commit_sha: str | None
    provenance_json: Annotated[
        str | None,
        click.Option(["--provenance-json"], type=click.STRING, required=False),
    ] = None


class NormalizedResolveThreadWithReplyRequest(ClinkrModel):
    thread_id: str
    mode: ResolutionReplyMode
    message: str | None = None
    commit_sha: str | None = None
    provenance: ResolutionProvenance | None = None


class ResolveThreadWithReplyResult(ClinkrModel):
    thread_id: str
    body: str
    comment: PRReviewComment
    is_resolved: bool
    provenance: ResolutionProvenance | None = None


@clinkr_operation(
    name="resolve-thread-with-reply",
    help="Reply to and resolve a PR review thread with canonical pr-address formatting.",
)
def run_resolve_thread_with_reply(
    ctx: click.Context,
    request: ResolveThreadWithReplyRequest,
) -> ClinkrExit[ResolveThreadWithReplyResult]:
    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    normalized = normalize_resolution_request(
        request,
        pr_gateway=pr_address_context.pr_gateway,
        git_gateway=pr_address_context.git_gateway,
    )
    return ClinkrExit.ok(apply_resolution(pr_address_context.pr_gateway, normalized))


def normalize_resolution_request(
    request: ResolveThreadWithReplyRequest,
    *,
    pr_gateway: PRGateway | None = None,
    git_gateway: GitGateway | None = None,
    provenance_input: ResolutionProvenanceInput | None = None,
) -> NormalizedResolveThreadWithReplyRequest:
    message = trim_optional(request.message)
    commit_sha = trim_optional(request.commit_sha)
    provenance_json = trim_optional(request.provenance_json)
    provenance_was_supplied = provenance_input is not None or provenance_json is not None
    if request.mode != "planned":
        Ensure.true(
            not provenance_was_supplied,
            error_type="invalid_request",
            message=(
                f"mode='{request.mode}' must not include provenance; provenance is only valid "
                "with mode='planned'"
            ),
        )

    parsed_provenance = provenance_input
    if request.mode == "planned" and parsed_provenance is None:
        parsed_provenance = parse_resolution_provenance_json(
            provenance_json,
            command_name="resolve-thread-with-reply",
        )

    provenance: ResolutionProvenance | None = None
    if request.mode == "fixed":
        Ensure.truthy(
            message,
            error_type="invalid_request",
            message="mode='fixed' requires a non-empty message",
        )
        Ensure.truthy(
            commit_sha,
            error_type="invalid_request",
            message="mode='fixed' requires a non-empty commit_sha",
        )
    elif request.mode == "explained":
        Ensure.truthy(
            message,
            error_type="invalid_request",
            message="mode='explained' requires a non-empty message",
        )
    elif request.mode == "planned":
        Ensure.truthy(
            message,
            error_type="invalid_request",
            message="mode='planned' requires a non-empty message",
        )
        Ensure.true(
            commit_sha is None,
            error_type="invalid_request",
            message="mode='planned' must not include commit_sha",
        )
        planned_provenance_input = Ensure.not_none(
            parsed_provenance,
            error_type="invalid_request",
            message="mode='planned' requires provenance",
        )
        provenance = validate_resolution_provenance(
            planned_provenance_input,
            pr_gateway=pr_gateway,
            git_gateway=git_gateway,
        )

    return NormalizedResolveThreadWithReplyRequest(
        thread_id=request.thread_id,
        mode=request.mode,
        message=message,
        commit_sha=commit_sha,
        provenance=provenance,
    )


def apply_resolution(
    pr_gateway: PRGateway,
    normalized: NormalizedResolveThreadWithReplyRequest,
) -> ResolveThreadWithReplyResult:
    body = format_resolution_reply(
        mode=normalized.mode,
        message=normalized.message,
        commit_sha=normalized.commit_sha,
        provenance=normalized.provenance,
    )

    comment = pr_gateway.add_review_thread_reply(normalized.thread_id, body)
    resolve_result = pr_gateway.resolve_review_thread(normalized.thread_id)
    return ResolveThreadWithReplyResult(
        thread_id=resolve_result.thread_id,
        body=body,
        comment=comment,
        is_resolved=resolve_result.is_resolved,
        provenance=normalized.provenance,
    )
