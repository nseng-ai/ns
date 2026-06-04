"""Compact payload manifests for PR feedback payloads."""

from __future__ import annotations

from typing import Literal, TypeAlias

from asdl_core.clinkr.models import ClinkrModel
from asdl_core.gh.types import (
    PRDiscussionComment,
    PRReview,
    PRReviewComment,
    PRReviewState,
    PRReviewThread,
    PRState,
)
from asdl_core.git.types import RestructuredFile
from asdl_core.payloads.models import PayloadReference

PayloadMode: TypeAlias = Literal["inline", "payload"]
RestructuredFiles: TypeAlias = tuple[RestructuredFile, ...]


class FeedbackDomainLocator(ClinkrModel):
    kind: Literal["review", "review_thread_comment", "discussion_comment"]
    review_id: str | None = None
    thread_id: str | None = None
    comment_id: int | None = None
    discussion_comment_id: int | None = None
    comment_index: int | None = None
    path: str | None = None
    line: int | None = None
    start_line: int | None = None
    is_resolved: bool | None = None
    is_outdated: bool | None = None
    author: str | None = None


class BodyLocator(ClinkrModel):
    body_chars: int
    json_pointer: str
    item_pointer: str | None = None
    domain: FeedbackDomainLocator


class FeedbackCounts(ClinkrModel):
    reviews: int
    review_threads: int
    unresolved_review_threads: int
    resolved_review_threads: int
    thread_comments: int
    discussion_comments: int


class ReviewManifestItem(ClinkrModel):
    id: str
    author: str
    state: PRReviewState
    submitted_at: str
    body_locator: BodyLocator


class ThreadCommentManifestItem(ClinkrModel):
    id: int
    author: str
    path: str
    line: int | None
    start_line: int | None
    created_at: str
    body_locator: BodyLocator


class ThreadManifestItem(ClinkrModel):
    thread_id: str
    path: str
    line: int | None
    start_line: int | None
    is_resolved: bool
    is_outdated: bool
    comment_count: int
    item_pointer: str
    comments: tuple[ThreadCommentManifestItem, ...]


class DiscussionCommentManifestItem(ClinkrModel):
    comment_id: int
    author: str
    url: str
    body_locator: BodyLocator


class GetFeedbackPayloadManifest(ClinkrModel):
    payload_mode: Literal["payload"] = "payload"
    payload_reference: PayloadReference
    pr_number: int
    counts: FeedbackCounts
    reviews: tuple[ReviewManifestItem, ...]
    review_threads: tuple[ThreadManifestItem, ...]
    discussion_comments: tuple[DiscussionCommentManifestItem, ...]


class PrepareRunPayloadManifest(ClinkrModel):
    payload_mode: Literal["payload"] = "payload"
    payload_reference: PayloadReference
    found: bool
    current_branch: str | None = None
    number: int | None = None
    title: str | None = None
    url: str | None = None
    head_ref_name: str | None = None
    base_ref_name: str | None = None
    state: PRState | None = None
    counts: FeedbackCounts | None = None
    reviews: tuple[ReviewManifestItem, ...] = ()
    review_threads: tuple[ThreadManifestItem, ...] = ()
    discussion_comments: tuple[DiscussionCommentManifestItem, ...] = ()
    reopened_thread_ids: tuple[str, ...] = ()
    restructured_files: RestructuredFiles = ()
    warnings: tuple[str, ...] = ()
    error: str | None = None
    returncode: int | None = None


def build_get_feedback_payload_manifest(
    *,
    payload_reference: PayloadReference,
    pr_number: int,
    reviews: tuple[PRReview, ...],
    review_threads: tuple[PRReviewThread, ...],
    discussion_comments: tuple[PRDiscussionComment, ...],
) -> GetFeedbackPayloadManifest:
    return GetFeedbackPayloadManifest(
        payload_reference=payload_reference,
        pr_number=pr_number,
        counts=_feedback_counts(
            reviews=reviews,
            review_threads=review_threads,
            discussion_comments=discussion_comments,
        ),
        reviews=_review_manifest_items(reviews),
        review_threads=_thread_manifest_items(review_threads),
        discussion_comments=_discussion_manifest_items(discussion_comments),
    )


def build_prepare_run_payload_manifest(
    *,
    payload_reference: PayloadReference,
    found: bool,
    current_branch: str | None,
    number: int | None = None,
    title: str | None = None,
    url: str | None = None,
    head_ref_name: str | None = None,
    base_ref_name: str | None = None,
    state: PRState | None = None,
    reviews: tuple[PRReview, ...] = (),
    review_threads: tuple[PRReviewThread, ...] = (),
    discussion_comments: tuple[PRDiscussionComment, ...] = (),
    reopened_thread_ids: tuple[str, ...] = (),
    restructured_files: RestructuredFiles = (),
    warnings: tuple[str, ...] = (),
    error: str | None = None,
    returncode: int | None = None,
) -> PrepareRunPayloadManifest:
    counts = None
    if found:
        counts = _feedback_counts(
            reviews=reviews,
            review_threads=review_threads,
            discussion_comments=discussion_comments,
        )

    return PrepareRunPayloadManifest(
        payload_reference=payload_reference,
        found=found,
        current_branch=current_branch,
        number=number,
        title=title,
        url=url,
        head_ref_name=head_ref_name,
        base_ref_name=base_ref_name,
        state=state,
        counts=counts,
        reviews=_review_manifest_items(reviews),
        review_threads=_thread_manifest_items(review_threads),
        discussion_comments=_discussion_manifest_items(discussion_comments),
        reopened_thread_ids=reopened_thread_ids,
        restructured_files=restructured_files,
        warnings=warnings,
        error=error,
        returncode=returncode,
    )


def _feedback_counts(
    *,
    reviews: tuple[PRReview, ...],
    review_threads: tuple[PRReviewThread, ...],
    discussion_comments: tuple[PRDiscussionComment, ...],
) -> FeedbackCounts:
    resolved_count = sum(1 for thread in review_threads if thread.is_resolved)
    thread_comment_count = sum(len(thread.comments) for thread in review_threads)
    return FeedbackCounts(
        reviews=len(reviews),
        review_threads=len(review_threads),
        unresolved_review_threads=len(review_threads) - resolved_count,
        resolved_review_threads=resolved_count,
        thread_comments=thread_comment_count,
        discussion_comments=len(discussion_comments),
    )


def _review_manifest_items(reviews: tuple[PRReview, ...]) -> tuple[ReviewManifestItem, ...]:
    items: list[ReviewManifestItem] = []
    for review_index, review in enumerate(reviews):
        item_pointer = f"/data/reviews/{review_index}"
        items.append(
            ReviewManifestItem(
                id=review.id,
                author=review.author,
                state=review.state,
                submitted_at=review.submitted_at,
                body_locator=BodyLocator(
                    body_chars=len(review.body),
                    json_pointer=f"{item_pointer}/body",
                    item_pointer=item_pointer,
                    domain=FeedbackDomainLocator(
                        kind="review",
                        review_id=review.id,
                        author=review.author,
                    ),
                ),
            )
        )
    return tuple(items)


def _thread_manifest_items(
    review_threads: tuple[PRReviewThread, ...],
) -> tuple[ThreadManifestItem, ...]:
    items: list[ThreadManifestItem] = []
    for thread_index, thread in enumerate(review_threads):
        item_pointer = f"/data/review_threads/{thread_index}"
        items.append(
            ThreadManifestItem(
                thread_id=thread.id,
                path=thread.path,
                line=thread.line,
                start_line=thread.start_line,
                is_resolved=thread.is_resolved,
                is_outdated=thread.is_outdated,
                comment_count=len(thread.comments),
                item_pointer=item_pointer,
                comments=_thread_comment_manifest_items(
                    thread=thread,
                    thread_index=thread_index,
                ),
            )
        )
    return tuple(items)


def _thread_comment_manifest_items(
    *,
    thread: PRReviewThread,
    thread_index: int,
) -> tuple[ThreadCommentManifestItem, ...]:
    items: list[ThreadCommentManifestItem] = []
    for comment_index, comment in enumerate(thread.comments):
        item_pointer = f"/data/review_threads/{thread_index}/comments/{comment_index}"
        items.append(
            ThreadCommentManifestItem(
                id=comment.id,
                author=comment.author,
                path=comment.path,
                line=comment.line,
                start_line=comment.start_line,
                created_at=comment.created_at,
                body_locator=_thread_comment_body_locator(
                    comment=comment,
                    thread=thread,
                    comment_index=comment_index,
                    item_pointer=item_pointer,
                ),
            )
        )
    return tuple(items)


def _thread_comment_body_locator(
    *,
    comment: PRReviewComment,
    thread: PRReviewThread,
    comment_index: int,
    item_pointer: str,
) -> BodyLocator:
    return BodyLocator(
        body_chars=len(comment.body),
        json_pointer=f"{item_pointer}/body",
        item_pointer=item_pointer,
        domain=FeedbackDomainLocator(
            kind="review_thread_comment",
            thread_id=thread.id,
            comment_id=comment.id,
            comment_index=comment_index,
            path=comment.path,
            line=comment.line,
            start_line=comment.start_line,
            is_resolved=thread.is_resolved,
            is_outdated=thread.is_outdated,
            author=comment.author,
        ),
    )


def _discussion_manifest_items(
    discussion_comments: tuple[PRDiscussionComment, ...],
) -> tuple[DiscussionCommentManifestItem, ...]:
    items: list[DiscussionCommentManifestItem] = []
    for comment_index, comment in enumerate(discussion_comments):
        item_pointer = f"/data/discussion_comments/{comment_index}"
        items.append(
            DiscussionCommentManifestItem(
                comment_id=comment.id,
                author=comment.author,
                url=comment.url,
                body_locator=BodyLocator(
                    body_chars=len(comment.body),
                    json_pointer=f"{item_pointer}/body",
                    item_pointer=item_pointer,
                    domain=FeedbackDomainLocator(
                        kind="discussion_comment",
                        discussion_comment_id=comment.id,
                        author=comment.author,
                    ),
                ),
            )
        )
    return tuple(items)
