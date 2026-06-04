"""Fetch all PR feedback (reviews, threads, discussion comments) in a single batch."""

from __future__ import annotations

import dataclasses
from typing import Annotated, Any, Literal

import click
from pydantic import model_serializer

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRDiscussionComment, PRReview, PRReviewThread
from asdl_core.payloads.clinkr import open_clinkr_payload_store, write_clinkr_raw_sidecar
from asdl_core.payloads.store import PayloadStore
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext
from asdl_pr_address.cli.pr_address.feedback_sidecar import (
    GetFeedbackSidecarManifest,
    PayloadMode,
    build_get_feedback_sidecar_manifest,
)
from asdl_pr_address.cli.pr_address.review_filtering import filter_empty_reviews


class GetFeedbackRequest(ClinkrModel):
    pr_number: int
    include_resolved: bool = False
    include_empty_reviews: bool = False
    payload_mode: Annotated[
        PayloadMode,
        click.Option(
            ["--payload-mode"],
            type=click.Choice(["inline", "sidecar"]),
            default="sidecar",
        ),
    ] = "sidecar"
    payload_session_id: Annotated[
        str | None,
        click.Option(["--payload-session-id"], type=click.STRING),
    ] = None


class GetFeedbackInlineResult(ClinkrModel):
    payload_mode: Literal["inline"] = "inline"
    pr_number: int
    reviews: tuple[PRReview, ...]
    review_threads: tuple[PRReviewThread, ...]
    discussion_comments: tuple[PRDiscussionComment, ...]

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        return {
            "payload_mode": self.payload_mode,
            "pr_number": self.pr_number,
            "reviews": [dataclasses.asdict(r) for r in self.reviews],
            "review_threads": [dataclasses.asdict(t) for t in self.review_threads],
            "discussion_comments": [dataclasses.asdict(c) for c in self.discussion_comments],
        }


@clinkr_operation(
    name="get-feedback",
    help="Fetch all PR feedback (reviews, threads, discussion comments) in a single batch.",
)
def run_get_feedback(
    ctx: click.Context,
    request: GetFeedbackRequest,
) -> ClinkrExit[GetFeedbackInlineResult | GetFeedbackSidecarManifest]:
    store: PayloadStore | None = None
    if request.payload_mode == "sidecar":
        store = open_clinkr_payload_store(request.payload_session_id)

    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    raw_reviews = pr_address_context.pr_gateway.get_reviews(request.pr_number)
    reviews = raw_reviews if request.include_empty_reviews else filter_empty_reviews(raw_reviews)
    inline_result = GetFeedbackInlineResult(
        pr_number=request.pr_number,
        reviews=reviews,
        review_threads=pr_address_context.pr_gateway.get_review_threads(
            request.pr_number, include_resolved=request.include_resolved
        ),
        discussion_comments=pr_address_context.pr_gateway.get_pr_discussion_comments(
            request.pr_number
        ),
    )
    if request.payload_mode == "inline":
        return ClinkrExit.ok(inline_result)

    if store is None:
        raise AssertionError("sidecar payload store must be opened before writing raw payload")
    raw_reference = write_clinkr_raw_sidecar(
        store=store,
        descriptor=f"pr-address-get-feedback-pr-{request.pr_number}",
        result=ClinkrExit.ok(inline_result),
    )
    return ClinkrExit.ok(
        build_get_feedback_sidecar_manifest(
            payload_reference=raw_reference,
            pr_number=inline_result.pr_number,
            reviews=inline_result.reviews,
            review_threads=inline_result.review_threads,
            discussion_comments=inline_result.discussion_comments,
        )
    )
