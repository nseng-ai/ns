"""Build a compact PR feedback summary for review-addressing agents."""

from __future__ import annotations

from typing import Any, Literal

import click
from pydantic import model_serializer

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import (
    PRDiscussionComment,
    PRGatewayFailure,
    PRLookupMiss,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    PRState,
    PRSummary,
)
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext
from asdl_pr_address.cli.pr_address.review_filtering import filter_empty_reviews

DiscussionSourceKind = Literal["automation_like", "human_like"]

_MAX_BODY_CHARS = 4000
_DEFAULT_BODY_CHARS = 320
_FIRST_LINE_CHARS = 160


class SummarizeFeedbackRequest(ClinkrModel):
    pr_number: int
    include_resolved: bool = False
    include_empty_reviews: bool = False
    body_chars: int = _DEFAULT_BODY_CHARS


class CompactPullRequestSummary(ClinkrModel):
    number: int
    title: str
    url: str
    head_ref_name: str
    base_ref_name: str
    state: PRState


class FeedbackSummaryCounts(ClinkrModel):
    reviews: int
    review_threads: int
    unresolved_review_threads: int
    resolved_review_threads: int
    discussion_comments: int


class CompactReviewSummary(ClinkrModel):
    id: str
    author: str
    state: str
    submitted_at: str
    body_first_line_excerpt: str | None
    body_excerpt: str


class CompactThreadCommentSummary(ClinkrModel):
    id: int
    author: str
    line: int | None
    start_line: int | None
    created_at: str
    body_first_line_excerpt: str | None
    body_excerpt: str


class CompactThreadSummary(ClinkrModel):
    thread_id: str
    path: str
    line: int | None
    start_line: int | None
    is_outdated: bool
    is_resolved: bool
    comment_count: int
    first_comment: CompactThreadCommentSummary | None


class CompactDiscussionCommentSummary(ClinkrModel):
    comment_id: int
    author: str
    url: str
    source_kind: DiscussionSourceKind
    source_evidence: tuple[str, ...]
    body_first_line_excerpt: str | None
    body_excerpt: str


class SummarizeFeedbackResult(ClinkrModel):
    found: bool
    pr_number: int
    pr: CompactPullRequestSummary | None = None
    counts: FeedbackSummaryCounts | None = None
    reviews: tuple[CompactReviewSummary, ...] = ()
    review_threads: tuple[CompactThreadSummary, ...] = ()
    discussion_comments: tuple[CompactDiscussionCommentSummary, ...] = ()
    error: str | None = None
    returncode: int | None = None

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        if not self.found:
            payload: dict[str, Any] = {"found": False, "pr_number": self.pr_number}
            if self.error is not None:
                payload["error"] = self.error
            if self.returncode is not None:
                payload["returncode"] = self.returncode
            return payload

        return {
            "found": True,
            "pr": self.pr.model_dump(mode="json") if self.pr is not None else None,
            "counts": self.counts.model_dump(mode="json") if self.counts is not None else None,
            "reviews": [review.model_dump(mode="json") for review in self.reviews],
            "review_threads": [thread.model_dump(mode="json") for thread in self.review_threads],
            "discussion_comments": [
                comment.model_dump(mode="json") for comment in self.discussion_comments
            ],
        }


@clinkr_operation(
    name="summarize-feedback",
    help="Fetch compact PR feedback evidence without full raw review JSON.",
)
def run_summarize_feedback(
    ctx: click.Context,
    request: SummarizeFeedbackRequest,
) -> ClinkrExit[SummarizeFeedbackResult]:
    Ensure.true(
        1 <= request.body_chars <= _MAX_BODY_CHARS,
        error_type="invalid_request",
        message=f"body_chars must be between 1 and {_MAX_BODY_CHARS}",
    )

    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    pr = pr_address_context.pr_gateway.get_pr(request.pr_number)
    if isinstance(pr, PRGatewayFailure):
        Ensure.fail(
            error_type="pr_gateway_failure",
            message=_gateway_failure_message(f"Failed to look up PR {request.pr_number}", pr),
        )
    if isinstance(pr, PRLookupMiss):
        result = SummarizeFeedbackResult(
            found=False,
            pr_number=request.pr_number,
            error=pr.stderr,
            returncode=pr.returncode,
        )
        return ClinkrExit.negative(
            result,
            message=f"No PR found for PR {request.pr_number}: {pr.stderr}",
        )

    raw_reviews = pr_address_context.pr_gateway.get_reviews(pr.number)
    reviews = raw_reviews if request.include_empty_reviews else filter_empty_reviews(raw_reviews)
    all_threads = pr_address_context.pr_gateway.get_review_threads(pr.number, include_resolved=True)
    returned_threads = (
        all_threads
        if request.include_resolved
        else tuple(thread for thread in all_threads if not thread.is_resolved)
    )
    discussion_comments = pr_address_context.pr_gateway.get_pr_discussion_comments(pr.number)

    return ClinkrExit.ok(
        SummarizeFeedbackResult(
            found=True,
            pr_number=pr.number,
            pr=_compact_pr(pr),
            counts=_counts(
                reviews=reviews,
                review_threads=all_threads,
                discussion_comments=discussion_comments,
            ),
            reviews=tuple(_compact_review(review, request.body_chars) for review in reviews),
            review_threads=tuple(
                _compact_thread(thread, request.body_chars) for thread in returned_threads
            ),
            discussion_comments=tuple(
                _compact_discussion_comment(comment, request.body_chars)
                for comment in discussion_comments
            ),
        )
    )


def _gateway_failure_message(prefix: str, failure: PRGatewayFailure) -> str:
    detail = failure.stderr or failure.stdout or f"exit code {failure.returncode}"
    return f"{prefix}: {detail}"


def _compact_pr(pr: PRSummary) -> CompactPullRequestSummary:
    return CompactPullRequestSummary(
        number=pr.number,
        title=pr.title,
        url=pr.url,
        head_ref_name=pr.head_ref_name,
        base_ref_name=pr.base_ref_name,
        state=pr.state,
    )


def _counts(
    *,
    reviews: tuple[PRReview, ...],
    review_threads: tuple[PRReviewThread, ...],
    discussion_comments: tuple[PRDiscussionComment, ...],
) -> FeedbackSummaryCounts:
    resolved_threads = sum(1 for thread in review_threads if thread.is_resolved)
    return FeedbackSummaryCounts(
        reviews=len(reviews),
        review_threads=len(review_threads),
        unresolved_review_threads=len(review_threads) - resolved_threads,
        resolved_review_threads=resolved_threads,
        discussion_comments=len(discussion_comments),
    )


def _compact_review(review: PRReview, body_chars: int) -> CompactReviewSummary:
    return CompactReviewSummary(
        id=review.id,
        author=review.author,
        state=review.state,
        submitted_at=review.submitted_at,
        body_first_line_excerpt=_first_non_empty_line_excerpt(review.body, _FIRST_LINE_CHARS),
        body_excerpt=_text_excerpt(review.body, body_chars),
    )


def _compact_thread(thread: PRReviewThread, body_chars: int) -> CompactThreadSummary:
    first_comment = thread.comments[0] if thread.comments else None
    return CompactThreadSummary(
        thread_id=thread.id,
        path=thread.path,
        line=thread.line,
        start_line=thread.start_line,
        is_outdated=thread.is_outdated,
        is_resolved=thread.is_resolved,
        comment_count=len(thread.comments),
        first_comment=(
            _compact_thread_comment(first_comment, body_chars)
            if first_comment is not None
            else None
        ),
    )


def _compact_thread_comment(
    comment: PRReviewComment,
    body_chars: int,
) -> CompactThreadCommentSummary:
    return CompactThreadCommentSummary(
        id=comment.id,
        author=comment.author,
        line=comment.line,
        start_line=comment.start_line,
        created_at=comment.created_at,
        body_first_line_excerpt=_first_non_empty_line_excerpt(comment.body, _FIRST_LINE_CHARS),
        body_excerpt=_text_excerpt(comment.body, body_chars),
    )


def _compact_discussion_comment(
    comment: PRDiscussionComment,
    body_chars: int,
) -> CompactDiscussionCommentSummary:
    evidence = _source_evidence(author=comment.author, body=comment.body)
    return CompactDiscussionCommentSummary(
        comment_id=comment.id,
        author=comment.author,
        url=comment.url,
        source_kind=_source_kind(evidence),
        source_evidence=evidence,
        body_first_line_excerpt=_first_non_empty_line_excerpt(comment.body, _FIRST_LINE_CHARS),
        body_excerpt=_text_excerpt(comment.body, body_chars),
    )


def _text_excerpt(text: str, max_chars: int) -> str:
    collapsed = " ".join(text.split())
    return _truncate(collapsed, max_chars)


def _first_non_empty_line_excerpt(text: str, max_chars: int) -> str | None:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return _truncate(stripped, max_chars)
    return None


def _truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    if max_chars == 1:
        return "…"
    return f"{text[: max_chars - 1].rstrip()}…"


def _source_evidence(*, author: str, body: str) -> tuple[str, ...]:
    evidence: list[str] = []
    if author.endswith("[bot]"):
        evidence.append("bot_author")
    if "<!-- roaster:" in body:
        evidence.append("roaster_marker")
    if "<!-- asdl-reviewer:" in body:
        evidence.append("asdl_reviewer_marker")
    if "[vc]:" in body:
        evidence.append("vercel_marker")
    if "app.graphite.com/github/pr/" in body:
        evidence.append("graphite_link")
    if "static.graphite.dev" in body:
        evidence.append("graphite_static_asset")
    return tuple(evidence)


def _source_kind(evidence: tuple[str, ...]) -> DiscussionSourceKind:
    if evidence:
        return "automation_like"
    return "human_like"
