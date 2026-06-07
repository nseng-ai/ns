"""Resolve multiple PR review threads with canonical pr-address replies."""

from __future__ import annotations

from typing import Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.json_input import load_json_input
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRReviewComment
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext
from asdl_pr_address.cli.pr_address.reply_formatting import ResolutionReplyMode
from asdl_pr_address.cli.pr_address.resolve_thread_with_reply import (
    ResolveThreadWithReplyRequest,
    apply_resolution,
    normalize_resolution_request,
)

ResolveThreadBatchItemStatus = Literal["resolved", "failed", "skipped"]


class ResolveThreadBatchRequest(ClinkrModel):
    payload_json: str | None = None


class ResolveThreadBatchItem(ClinkrModel):
    thread_id: str
    mode: ResolutionReplyMode
    message: str | None = None
    commit_sha: str | None = None


class ResolveThreadBatchPayload(ClinkrModel):
    commit_sha: str | None = None
    continue_on_error: bool = False
    items: tuple[ResolveThreadBatchItem, ...]


class ResolveThreadBatchItemResult(ClinkrModel):
    index: int
    thread_id: str
    mode: ResolutionReplyMode
    status: ResolveThreadBatchItemStatus
    body: str | None = None
    comment: PRReviewComment | None = None
    is_resolved: bool | None = None
    error_type: str | None = None
    error_message: str | None = None


class ResolveThreadBatchResult(ClinkrModel):
    total: int
    resolved: int
    failed: int
    skipped: int
    all_succeeded: bool
    results: tuple[ResolveThreadBatchItemResult, ...]


@clinkr_operation(
    name="resolve-thread-batch",
    help="Reply to and resolve multiple PR review threads from a JSON payload.",
)
def run_resolve_thread_batch(
    ctx: click.Context,
    request: ResolveThreadBatchRequest,
) -> ClinkrExit[ResolveThreadBatchResult]:
    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    payload = _load_payload(request)
    normalized_requests = _normalize_payload(payload)

    results: list[ResolveThreadBatchItemResult] = []
    for index, item in enumerate(normalized_requests):
        try:
            resolved = apply_resolution(pr_address_context.pr_gateway, item)
        except Exception as exc:
            results.append(
                ResolveThreadBatchItemResult(
                    index=index,
                    thread_id=item.thread_id,
                    mode=item.mode,
                    status="failed",
                    error_type="gateway_error",
                    error_message=str(exc),
                )
            )
            if not payload.continue_on_error:
                results.extend(_skipped_results(normalized_requests[index + 1 :], start=index + 1))
                break
            continue

        results.append(
            ResolveThreadBatchItemResult(
                index=index,
                thread_id=resolved.thread_id,
                mode=item.mode,
                status="resolved",
                body=resolved.body,
                comment=resolved.comment,
                is_resolved=resolved.is_resolved,
            )
        )

    result = _batch_result(total=len(normalized_requests), results=tuple(results))
    if result.all_succeeded:
        return ClinkrExit.ok(result)
    return ClinkrExit.negative(result, message=_negative_message(result))


def _load_payload(request: ResolveThreadBatchRequest) -> ResolveThreadBatchPayload:
    return load_json_input(
        option_value=request.payload_json,
        command_name="resolve-thread-batch",
        input_description="JSON payload",
        option_name="--payload-json",
        parser=ResolveThreadBatchPayload.model_validate_json,
    )


def _normalize_payload(
    payload: ResolveThreadBatchPayload,
) -> tuple[ResolveThreadWithReplyRequest, ...]:
    Ensure.true(
        bool(payload.items),
        error_type="invalid_request",
        message="resolve-thread-batch payload must include at least one item",
    )

    seen_thread_ids: set[str] = set()
    normalized: list[ResolveThreadWithReplyRequest] = []
    batch_commit_sha = _trim_optional(payload.commit_sha)
    for index, item in enumerate(payload.items):
        thread_id = item.thread_id.strip()
        Ensure.truthy(
            thread_id,
            error_type="invalid_request",
            message=f"items[{index}].thread_id must be non-empty",
        )
        Ensure.true(
            thread_id not in seen_thread_ids,
            error_type="invalid_request",
            message=f"Duplicate thread_id in resolve-thread-batch payload: {thread_id}",
        )
        seen_thread_ids.add(thread_id)

        normalized.append(
            normalize_resolution_request(
                ResolveThreadWithReplyRequest(
                    thread_id=thread_id,
                    mode=item.mode,
                    message=item.message,
                    commit_sha=_trim_optional(item.commit_sha) or batch_commit_sha,
                )
            )
        )
    return tuple(normalized)


def _trim_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    return stripped


def _skipped_results(
    items: tuple[ResolveThreadWithReplyRequest, ...],
    *,
    start: int,
) -> list[ResolveThreadBatchItemResult]:
    return [
        ResolveThreadBatchItemResult(
            index=start + offset,
            thread_id=item.thread_id,
            mode=item.mode,
            status="skipped",
            error_type="skipped_after_failure",
            error_message="Skipped because an earlier item failed and continue_on_error is false.",
        )
        for offset, item in enumerate(items)
    ]


def _batch_result(
    *,
    total: int,
    results: tuple[ResolveThreadBatchItemResult, ...],
) -> ResolveThreadBatchResult:
    resolved = sum(1 for item in results if item.status == "resolved")
    failed = sum(1 for item in results if item.status == "failed")
    skipped = sum(1 for item in results if item.status == "skipped")
    return ResolveThreadBatchResult(
        total=total,
        resolved=resolved,
        failed=failed,
        skipped=skipped,
        all_succeeded=failed == 0 and skipped == 0 and resolved == total,
        results=results,
    )


def _negative_message(result: ResolveThreadBatchResult) -> str:
    return (
        "resolve-thread-batch failed for "
        f"{result.failed} item(s); skipped {result.skipped} item(s)."
    )
